import { describe, it, expect } from "vitest";
import { reconnectDelay } from "../src/utils/redis.util";

/**
 * A Redis that comes back has to be a Redis that is back.
 *
 * The strategy this pins was `retries > 3 ? false : backoff`, unconditionally.
 * `false` tells node-redis to stop reconnecting permanently, and `initialize`
 * only nulls the client when the *initial* connect throws - so a Redis that
 * blipped and returned left the process holding a closed client that
 * `getClient()` went on handing out. No caching and per-process rate limits for
 * the life of that process, warned about exactly once.
 *
 * Verified by hand on 10 Sep - Redis stopped and restarted under a running API,
 * which never wrote another key until it was restarted - and pinned here so it
 * cannot come back. `REDIS-PLAN.md` §3 carries the reasoning.
 *
 * The two halves pull in opposite directions, which is the whole difficulty: a
 * port that was never right should give up, and a port that worked a second ago
 * should not.
 */
describe("reconnectDelay", () => {
  describe("before the first successful connection", () => {
    it("backs off for the first few attempts", () => {
      expect(reconnectDelay(1, false)).toBe(200);
      expect(reconnectDelay(2, false)).toBe(400);
      expect(reconnectDelay(3, false)).toBe(600);
    });

    it("gives up after three, so `connect()` rejects and the client is nulled", () => {
      expect(reconnectDelay(4, false)).toBe(false);
      expect(reconnectDelay(50, false)).toBe(false);
    });
  });

  describe("after a connection has succeeded", () => {
    it("never gives up - a closed socket is an outage, not a wrong port", () => {
      expect(reconnectDelay(4, true)).not.toBe(false);
      expect(reconnectDelay(500, true)).not.toBe(false);
      expect(reconnectDelay(10_000, true)).not.toBe(false);
    });

    it("caps the backoff at two seconds rather than growing without bound", () => {
      expect(reconnectDelay(10, true)).toBe(2000);
      expect(reconnectDelay(10_000, true)).toBe(2000);
    });

    it("still backs off gently at first", () => {
      expect(reconnectDelay(1, true)).toBe(200);
      expect(reconnectDelay(5, true)).toBe(1000);
    });
  });

  /**
   * The regression in one line: this is the exact call that used to return
   * `false` and end caching for the life of the process.
   */
  it("does not give up on the fourth retry of a connection that once worked", () => {
    expect(reconnectDelay(4, true)).toBe(800);
  });
});
