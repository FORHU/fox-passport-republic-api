import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Request, Response } from "express";

/**
 * app#308: how GET /feed's `mode` reaches the service. `top` (the old ranked
 * mode) becomes For you so older web tabs keep working; no mode keeps the
 * original pinned-first order older mobile builds expect.
 */

const service = vi.hoisted(() => ({
  getFeed: vi.fn(),
  countNewPosts: vi.fn(),
}));
vi.mock("../src/modules/feed/feed.service", () => ({ default: service }));

const { default: FeedController } =
  await import("../src/modules/feed/feed.controller");

function res() {
  const r = {
    statusCode: 0,
    body: undefined as unknown,
    status(code: number) {
      r.statusCode = code;
      return r;
    },
    json(body: unknown) {
      r.body = body;
      return r;
    },
  };
  return r;
}

const call = async (
  handler: (req: Request, res: Response) => Promise<unknown>,
  query: Record<string, string>,
) => {
  const r = res();
  await handler(
    { query, params: {} } as unknown as Request,
    r as unknown as Response,
  );
  return r;
};

beforeEach(() => {
  vi.clearAllMocks();
  service.getFeed.mockResolvedValue({ posts: [], nextCursor: null });
  service.countNewPosts.mockResolvedValue(3);
});

describe("GET /feed mode", () => {
  it.each([
    [{ mode: "foryou" }, "foryou"],
    [{ mode: "top" }, "foryou"],
    [{ mode: "recent" }, "recent"],
    [{}, "legacy"],
    [{ mode: "something-else" }, "legacy"],
  ])("%j → %s", async (query, expected) => {
    await call(FeedController.getFeed, query);
    expect(service.getFeed).toHaveBeenCalledWith(
      expect.objectContaining({ mode: expected }),
    );
  });
});

describe("GET /feed/new-count", () => {
  it("answers the count for a valid `since`", async () => {
    const r = await call(FeedController.getNewPostsCount, {
      since: "2026-11-18T12:00:00.000Z",
      tab: "all",
    });
    expect(r.statusCode).toBe(200);
    expect(r.body).toEqual({ success: true, data: { count: 3 } });
    expect(service.countNewPosts).toHaveBeenCalledWith(
      { tab: undefined, viewerId: undefined },
      new Date("2026-11-18T12:00:00.000Z"),
    );
  });

  it.each([{}, { since: "yesterday" }])(
    "refuses %j with 400",
    async (query) => {
      const r = await call(FeedController.getNewPostsCount, query);
      expect(r.statusCode).toBe(400);
      expect(service.countNewPosts).not.toHaveBeenCalled();
    },
  );
});
