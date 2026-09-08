import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * `io` is `export let io: Server`, assigned only by `initSocketServer`, which
 * only `server.ts` calls. Any entry point that imports `app` on its own - a
 * serverless handler, a script, a test that mounts the Express app - leaves it
 * `undefined`, and the emit used to run `io.to(...)` straight into a
 * `TypeError`.
 *
 * That mattered because of who awaits it. `RoleRequestSvc.review` awaits
 * `create()` with no try/catch, after its transaction has committed: the
 * applicant holds the new role and the admin is told the decision failed.
 *
 * These load the service through `vi.doMock` rather than mutating a shared
 * mock, because the whole point is what the module sees at import time.
 */

const notification = {
  id: "notification-1",
  userId: "user-1",
  type: "role_request_approved",
  title: "Application approved",
  message: "You are now a host.",
  metadata: null,
  isRead: false,
  createdAt: new Date(),
};

const repo = { create: vi.fn(async () => notification) };

const input = {
  userId: "user-1",
  type: "role_request_approved",
  title: "Application approved",
  message: "You are now a host.",
};

async function loadServiceWith(io: unknown) {
  vi.resetModules();
  vi.doMock("../src/infrastructure/socket/socket.server", () => ({ io }));
  vi.doMock(
    "../src/modules/notifications/user-notification.repository",
    () => ({ default: repo }),
  );
  const mod =
    await import("../src/modules/notifications/user-notification.service");
  return mod.default;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
});

describe("NotificationService.create", () => {
  it("writes the row and resolves when no socket server exists", async () => {
    const NotificationService = await loadServiceWith(undefined);

    await expect(NotificationService.create(input)).resolves.toMatchObject({
      id: "notification-1",
    });
    expect(repo.create).toHaveBeenCalledTimes(1);
  });

  it("resolves when the emit itself throws", async () => {
    // A live `io` is no guarantee: `.to().emit()` can throw on its own.
    const io = {
      to: () => ({
        emit: () => {
          throw new Error("socket is having a day");
        },
      }),
    };
    const NotificationService = await loadServiceWith(io);

    await expect(NotificationService.create(input)).resolves.toMatchObject({
      id: "notification-1",
    });
    expect(repo.create).toHaveBeenCalledTimes(1);
  });

  it("still emits to the user's room when the socket is up", async () => {
    const emit = vi.fn();
    const to = vi.fn(() => ({ emit }));
    const NotificationService = await loadServiceWith({ to });

    await NotificationService.create(input);

    // The room is the user id - see `userRoom` in socket.constants.ts.
    expect(to).toHaveBeenCalledWith("user-1");
    expect(emit).toHaveBeenCalledWith(
      "new_notification",
      expect.objectContaining({ id: "notification-1" }),
    );
  });
});
