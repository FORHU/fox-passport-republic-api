import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * The socket authenticated with the raw access token read from the client auth
 * store. That store stopped holding one when tokens moved to httpOnly cookies,
 * so `SocketProvider` bailed out before connecting and the realtime channel was
 * dead - silently, because a socket that never connects looks like a quiet one.
 *
 * The ticket is what replaces it. These pin the properties that make it safe to
 * hand to client JavaScript when a token is not: single-use, short-lived, and
 * useless if the store is gone.
 */

const redis = vi.hoisted(() => {
  const store = new Map<string, string>();
  return {
    store,
    available: { value: true },
    client: {
      set: vi.fn(async (key: string, value: string) => {
        store.set(key, value);
        return "OK";
      }),
      getDel: vi.fn(async (key: string) => {
        const value = store.get(key) ?? null;
        store.delete(key);
        return value;
      }),
    },
  };
});

vi.mock("../src/utils/redis.util", () => ({
  default: { getClient: () => (redis.available.value ? redis.client : null) },
}));

import {
  issueSocketTicket,
  redeemSocketTicket,
} from "../src/modules/auth/socket-ticket.service";

const identity = { userId: "user-1", systemRole: "admin" as const };

beforeEach(() => {
  vi.clearAllMocks();
  redis.store.clear();
  redis.available.value = true;
});

describe("socket tickets", () => {
  it("round-trips the identity it was issued for", async () => {
    const ticket = await issueSocketTicket(identity);
    expect(await redeemSocketTicket(ticket)).toEqual(identity);
  });

  it("cannot be redeemed twice", async () => {
    const ticket = await issueSocketTicket(identity);

    expect(await redeemSocketTicket(ticket)).toEqual(identity);
    // A reconnect replaying a spent ticket must fail, which is why the client
    // fetches a fresh one per connection attempt.
    expect(await redeemSocketTicket(ticket)).toBeNull();
  });

  it("expires — the entry carries a one-minute TTL", async () => {
    await issueSocketTicket(identity);

    expect(redis.client.set).toHaveBeenCalledWith(
      expect.stringContaining("socket:ticket:"),
      expect.any(String),
      { EX: 60 },
    );
  });

  it("mints a different ticket every time", async () => {
    expect(await issueSocketTicket(identity)).not.toBe(
      await issueSocketTicket(identity),
    );
  });

  it("rejects a ticket that was never issued", async () => {
    expect(await redeemSocketTicket("made-up")).toBeNull();
  });

  it("carries the role, so admins can be put in the admin room", async () => {
    const ticket = await issueSocketTicket(identity);
    const redeemed = await redeemSocketTicket(ticket);
    expect(redeemed?.systemRole).toBe("admin");
  });

  it("fails closed when the store is unavailable", async () => {
    redis.available.value = false;
    await expect(issueSocketTicket(identity)).rejects.toThrow(/unavailable/i);
  });

  it("returns null rather than throwing when redeeming without a store", async () => {
    redis.available.value = false;
    expect(await redeemSocketTicket("anything")).toBeNull();
  });
});
