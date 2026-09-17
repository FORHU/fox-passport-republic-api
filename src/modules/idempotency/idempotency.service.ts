import crypto from "crypto";
import { prisma } from "../../utils/prisma";
import {
  ClaimResult,
  IdempotencyPayloadMismatchError,
  IdempotencyRequesterMismatchError,
} from "./idempotency.types";

const LEASE_MINUTES = 2;

interface IdempotencyRow {
  id: string;
  endpoint: string;
  idempotencyKey: string;
  requesterId: string;
  bookingId: string | null;
  requestHash: string;
  status: "in_progress" | "succeeded" | "failed";
  executionToken: string;
  responseBody: unknown;
}

/**
 * Request-level idempotency for double-submit protection (a citizen's
 * double-click, a client retry after a dropped response) — a DIFFERENT
 * concern from the partial unique indexes on the transaction tables, which
 * enforce a business rule (no two simultaneously-active reservations for
 * the same booking+item), not a network-retry guarantee.
 *
 * Claiming is a single atomic INSERT ... ON CONFLICT ... DO UPDATE, never
 * read-then-write — the WHERE clause on the DO UPDATE is what makes stale
 * (failed, or in_progress past its lease) keys reclaimable while leaving a
 * live in_progress or already-succeeded key alone. `executionToken` +
 * `leaseExpiresAt` exist specifically so a worker whose lease was reclaimed
 * cannot later overwrite the result of whichever worker legitimately holds
 * the key now — `complete`'s write is conditioned on still holding the
 * token it was issued.
 */
export default class IdempotencySvc {
  private static hash(payload: unknown): string {
    return crypto
      .createHash("sha256")
      .update(JSON.stringify(payload))
      .digest("hex");
  }

  static async claim(params: {
    endpoint: string;
    idempotencyKey: string;
    requesterId: string;
    bookingId?: string;
    requestPayload: unknown;
  }): Promise<ClaimResult> {
    const requestHash = this.hash(params.requestPayload);
    const executionToken = crypto.randomUUID();
    const newId = crypto.randomUUID();
    // Computed in JS and passed as a plain parameter — interpolating a
    // value inside a quoted SQL literal (e.g. interval '${n} minutes')
    // breaks Prisma's parameter binding (this was caught for real: it threw
    // "bind message supplies 8 parameters, but prepared statement requires
    // 7", not a passing-but-wrong result).
    const leaseExpiresAt = new Date(Date.now() + LEASE_MINUTES * 60 * 1000);

    const claimed: IdempotencyRow[] = await prisma.$queryRaw`
      INSERT INTO request_idempotency_keys
        (id, endpoint, "idempotencyKey", "requesterId", "bookingId", "requestHash", status, "executionToken", "leaseExpiresAt", "createdAt", "updatedAt")
      VALUES
        (${newId}, ${params.endpoint}, ${params.idempotencyKey}, ${params.requesterId}, ${params.bookingId ?? null}, ${requestHash}, 'in_progress', ${executionToken}, ${leaseExpiresAt}, NOW(), NOW())
      ON CONFLICT (endpoint, "idempotencyKey") DO UPDATE SET
        "executionToken" = EXCLUDED."executionToken",
        "leaseExpiresAt" = EXCLUDED."leaseExpiresAt",
        status = 'in_progress',
        "updatedAt" = NOW()
      WHERE request_idempotency_keys.status = 'failed'
         OR (request_idempotency_keys.status = 'in_progress' AND request_idempotency_keys."leaseExpiresAt" < NOW())
      RETURNING *
    `;

    if (claimed.length > 0) {
      return { status: "claimed", executionToken };
    }

    // Did not win the claim — either it's already succeeded, or someone
    // else legitimately holds an unexpired lease. Read to find out which,
    // and validate this caller actually matches the original request
    // before telling them anything about it.
    const existingRows: IdempotencyRow[] = await prisma.$queryRaw`
      SELECT * FROM request_idempotency_keys
      WHERE endpoint = ${params.endpoint} AND "idempotencyKey" = ${params.idempotencyKey}
    `;
    const existing = existingRows[0];
    if (!existing) {
      // Vanishingly unlikely race (deleted between the failed insert and
      // this read) — safe to just retry the claim once.
      return this.claim(params);
    }

    if (existing.requesterId !== params.requesterId) {
      throw new IdempotencyRequesterMismatchError();
    }
    if (existing.requestHash !== requestHash) {
      throw new IdempotencyPayloadMismatchError();
    }
    if (existing.status === "succeeded") {
      return { status: "cached", responseBody: existing.responseBody };
    }
    return { status: "in_progress" };
  }

  /**
   * Guarded by executionToken: if this worker's lease was reclaimed by
   * another (because it ran past LEASE_MINUTES), this write matches zero
   * rows and is silently a no-op — the worker that holds the current token
   * is the only one whose completion can stick.
   */
  static async complete(params: {
    endpoint: string;
    idempotencyKey: string;
    executionToken: string;
    status: "succeeded" | "failed";
    responseBody?: unknown;
  }): Promise<void> {
    await prisma.$executeRaw`
      UPDATE request_idempotency_keys
      SET status = ${params.status},
          "responseBody" = ${params.responseBody === undefined ? null : JSON.stringify(params.responseBody)}::jsonb,
          "updatedAt" = NOW()
      WHERE endpoint = ${params.endpoint}
        AND "idempotencyKey" = ${params.idempotencyKey}
        AND "executionToken" = ${params.executionToken}
    `;
  }
}
