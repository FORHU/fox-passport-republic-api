import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Request, Response } from "express";

// The service is mocked, so this checks only what the endpoint accepts and
// what it passes on (api#476). No database.
vi.mock("../src/modules/event-transaction/event-transaction.service", () => ({
  default: { reviewItem: vi.fn(async () => ({ id: "t1" })) },
  declineReasonText: vi.fn(),
}));

import EventTransactionSvc from "../src/modules/event-transaction/event-transaction.service";
import EventTransactionCtrl from "../src/modules/event-transaction/event-transaction.controller";

const reviewItem = vi.mocked(EventTransactionSvc.reviewItem);

async function review(body: Record<string, unknown>) {
  const res = {
    statusCode: 0,
    payload: undefined as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(p: unknown) {
      this.payload = p;
      return this;
    },
  };
  await EventTransactionCtrl.reviewItem(
    {
      params: { id: "t1" },
      body,
      user: { userId: "u1" },
    } as unknown as Request,
    res as unknown as Response,
  );
  return res;
}

describe("PATCH /event-transactions/:id/review — reason and note (api#476)", () => {
  beforeEach(() => reviewItem.mockClear());

  it("passes a reason and note on decline", async () => {
    const res = await review({
      type: "venue",
      action: "decline",
      reason: "closed",
      note: "Repairs",
    });
    expect(res.statusCode).toBe(200);
    expect(reviewItem).toHaveBeenCalledWith(
      "t1",
      "venue",
      "decline",
      "u1",
      undefined,
      { reason: "closed", note: "Repairs" },
    );
  });

  it("treats already booked as busy when no cause is sent", async () => {
    await review({
      type: "venue",
      action: "decline",
      reason: "already_booked",
    });
    expect(reviewItem.mock.calls[0][4]).toBe("busy");
  });

  it("keeps an explicit cause", async () => {
    await review({
      type: "venue",
      action: "decline",
      cause: "other",
      reason: "already_booked",
    });
    expect(reviewItem.mock.calls[0][4]).toBe("other");
  });

  it("takes a reason on reject too", async () => {
    const res = await review({
      type: "asset",
      action: "reject",
      reason: "not_suitable",
    });
    expect(res.statusCode).toBe(200);
    expect(reviewItem.mock.calls[0][5]).toEqual({
      reason: "not_suitable",
      note: undefined,
    });
  });

  it("needs a note for other", async () => {
    const res = await review({
      type: "venue",
      action: "decline",
      reason: "other",
    });
    expect(res.statusCode).toBe(400);
    expect(reviewItem).not.toHaveBeenCalled();
  });

  it("refuses a blank note for other", async () => {
    const res = await review({
      type: "venue",
      action: "decline",
      reason: "other",
      note: "   ",
    });
    expect(res.statusCode).toBe(400);
  });

  it("refuses a note over 300 characters", async () => {
    const res = await review({
      type: "venue",
      action: "decline",
      reason: "closed",
      note: "x".repeat(301),
    });
    expect(res.statusCode).toBe(400);
  });

  it("refuses a note without a reason", async () => {
    const res = await review({ type: "venue", action: "decline", note: "Hi" });
    expect(res.statusCode).toBe(400);
  });

  it("refuses an unknown reason", async () => {
    const res = await review({
      type: "venue",
      action: "decline",
      reason: "too_far",
    });
    expect(res.statusCode).toBe(400);
  });

  it("refuses a reason on confirm", async () => {
    const res = await review({
      type: "venue",
      action: "confirm",
      reason: "closed",
    });
    expect(res.statusCode).toBe(400);
    expect(reviewItem).not.toHaveBeenCalled();
  });

  it("still works without a reason, as older clients send it", async () => {
    const res = await review({
      type: "venue",
      action: "decline",
      cause: "busy",
    });
    expect(res.statusCode).toBe(200);
    expect(reviewItem).toHaveBeenCalledWith(
      "t1",
      "venue",
      "decline",
      "u1",
      "busy",
      undefined,
    );
  });
});
