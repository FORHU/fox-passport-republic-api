import { describe, it, expect, afterEach } from "vitest";
import { prisma } from "../src/utils/prisma";
import IdempotencySvc from "../src/modules/idempotency/idempotency.service";
import {
  IdempotencyPayloadMismatchError,
  IdempotencyRequesterMismatchError,
} from "../src/modules/idempotency/idempotency.types";

describe("IdempotencySvc — atomic claim, lease, and completion guarding", () => {
  const endpoint = "test:endpoint";

  afterEach(async () => {
    await prisma.$executeRaw`DELETE FROM request_idempotency_keys WHERE endpoint = ${endpoint}`;
  });

  it("claims a fresh key", async () => {
    const result = await IdempotencySvc.claim({
      endpoint,
      idempotencyKey: "key-1",
      requesterId: "user-1",
      requestPayload: { a: 1 },
    });
    expect(result.status).toBe("claimed");
  });

  it("same key + same payload, after completion: returns the cached response, not a re-execution", async () => {
    const claim = await IdempotencySvc.claim({
      endpoint,
      idempotencyKey: "key-2",
      requesterId: "user-1",
      requestPayload: { a: 1 },
    });
    if (claim.status !== "claimed") throw new Error("expected claimed");

    await IdempotencySvc.complete({
      endpoint,
      idempotencyKey: "key-2",
      executionToken: claim.executionToken,
      status: "succeeded",
      responseBody: { result: "ok" },
    });

    const retry = await IdempotencySvc.claim({
      endpoint,
      idempotencyKey: "key-2",
      requesterId: "user-1",
      requestPayload: { a: 1 },
    });
    expect(retry.status).toBe("cached");
    if (retry.status === "cached") {
      expect(retry.responseBody).toEqual({ result: "ok" });
    }
  });

  it("same key + different payload: rejected, not silently using either payload", async () => {
    await IdempotencySvc.claim({
      endpoint,
      idempotencyKey: "key-3",
      requesterId: "user-1",
      requestPayload: { a: 1 },
    });

    await expect(
      IdempotencySvc.claim({
        endpoint,
        idempotencyKey: "key-3",
        requesterId: "user-1",
        requestPayload: { a: 2 },
      }),
    ).rejects.toThrow(IdempotencyPayloadMismatchError);
  });

  it("same key + different requester: rejected", async () => {
    await IdempotencySvc.claim({
      endpoint,
      idempotencyKey: "key-4",
      requesterId: "user-1",
      requestPayload: { a: 1 },
    });

    await expect(
      IdempotencySvc.claim({
        endpoint,
        idempotencyKey: "key-4",
        requesterId: "user-2",
        requestPayload: { a: 1 },
      }),
    ).rejects.toThrow(IdempotencyRequesterMismatchError);
  });

  it("original request still in progress: a concurrent duplicate sees in_progress, not a second claim", async () => {
    await IdempotencySvc.claim({
      endpoint,
      idempotencyKey: "key-5",
      requesterId: "user-1",
      requestPayload: { a: 1 },
    });

    const duplicate = await IdempotencySvc.claim({
      endpoint,
      idempotencyKey: "key-5",
      requesterId: "user-1",
      requestPayload: { a: 1 },
    });
    expect(duplicate.status).toBe("in_progress");
  });

  it("original request failed: a retry with the same key + payload is allowed to re-attempt", async () => {
    const first = await IdempotencySvc.claim({
      endpoint,
      idempotencyKey: "key-6",
      requesterId: "user-1",
      requestPayload: { a: 1 },
    });
    if (first.status !== "claimed") throw new Error("expected claimed");

    await IdempotencySvc.complete({
      endpoint,
      idempotencyKey: "key-6",
      executionToken: first.executionToken,
      status: "failed",
    });

    const retry = await IdempotencySvc.claim({
      endpoint,
      idempotencyKey: "key-6",
      requesterId: "user-1",
      requestPayload: { a: 1 },
    });
    expect(retry.status).toBe("claimed");
  });

  it("retry after timeout: a stale in_progress lease can be reclaimed by a new attempt", async () => {
    const first = await IdempotencySvc.claim({
      endpoint,
      idempotencyKey: "key-7",
      requesterId: "user-1",
      requestPayload: { a: 1 },
    });
    if (first.status !== "claimed") throw new Error("expected claimed");

    // Simulate the lease having expired (a crashed worker) without waiting
    // 2 real minutes.
    await prisma.$executeRaw`
      UPDATE request_idempotency_keys
      SET "leaseExpiresAt" = NOW() - interval '1 minute'
      WHERE endpoint = ${endpoint} AND "idempotencyKey" = 'key-7'
    `;

    const reclaimed = await IdempotencySvc.claim({
      endpoint,
      idempotencyKey: "key-7",
      requesterId: "user-1",
      requestPayload: { a: 1 },
    });
    expect(reclaimed.status).toBe("claimed");
    if (reclaimed.status === "claimed") {
      expect(reclaimed.executionToken).not.toBe(first.executionToken);
    }
  });

  it("a zombie worker whose lease was already reclaimed cannot overwrite the new holder's result", async () => {
    const original = await IdempotencySvc.claim({
      endpoint,
      idempotencyKey: "key-8",
      requesterId: "user-1",
      requestPayload: { a: 1 },
    });
    if (original.status !== "claimed") throw new Error("expected claimed");

    // Force expiry and let a second worker reclaim the key.
    await prisma.$executeRaw`
      UPDATE request_idempotency_keys
      SET "leaseExpiresAt" = NOW() - interval '1 minute'
      WHERE endpoint = ${endpoint} AND "idempotencyKey" = 'key-8'
    `;
    const reclaimed = await IdempotencySvc.claim({
      endpoint,
      idempotencyKey: "key-8",
      requesterId: "user-1",
      requestPayload: { a: 1 },
    });
    if (reclaimed.status !== "claimed") throw new Error("expected claimed");

    // The ORIGINAL (zombie) worker finally finishes and tries to complete
    // using its now-stale token.
    await IdempotencySvc.complete({
      endpoint,
      idempotencyKey: "key-8",
      executionToken: original.executionToken, // stale
      status: "succeeded",
      responseBody: { from: "zombie" },
    });

    // The row must be untouched by the zombie's write — still in_progress
    // under the second worker's token, not overwritten with the zombie's
    // result.
    const row: { status: string; responseBody: unknown }[] = await prisma.$queryRaw`
      SELECT status, "responseBody" FROM request_idempotency_keys
      WHERE endpoint = ${endpoint} AND "idempotencyKey" = 'key-8'
    `;
    expect(row[0].status).toBe("in_progress");
    expect(row[0].responseBody).toBeNull();

    // The legitimate second worker's completion, by contrast, does stick.
    await IdempotencySvc.complete({
      endpoint,
      idempotencyKey: "key-8",
      executionToken: reclaimed.executionToken,
      status: "succeeded",
      responseBody: { from: "second-worker" },
    });
    const rowAfter: { status: string; responseBody: unknown }[] = await prisma.$queryRaw`
      SELECT status, "responseBody" FROM request_idempotency_keys
      WHERE endpoint = ${endpoint} AND "idempotencyKey" = 'key-8'
    `;
    expect(rowAfter[0].status).toBe("succeeded");
    expect(rowAfter[0].responseBody).toEqual({ from: "second-worker" });
  });
});
