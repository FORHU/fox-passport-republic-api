import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Request, Response } from "express";

/**
 * PUT /profile: a username is letters, numbers, `_` and `.` only, a phone is
 * 8–15 digits with an optional `+`, and an empty phone clears the number.
 * A rejected field is named in the response so the form can show the message
 * under that input.
 */

vi.mock("../src/modules/fx/fx.service", () => ({
  SUPPORTED_CURRENCIES: ["PHP", "USD"],
}));

const updateProfile = vi.hoisted(() => vi.fn(async () => ({ id: "u1" })));
vi.mock("../src/modules/profile/profile.service", () => ({
  USERNAME_TAKEN: "Username already taken",
  default: { updateProfile },
}));

const repoUpdate = vi.hoisted(() => vi.fn(async () => ({})));
const findByUsername = vi.hoisted(() => vi.fn(async () => null));

import ProfileCtrl from "../src/modules/profile/profile.controller";

function call(body: Record<string, unknown>) {
  const res = {
    statusCode: 0,
    body: undefined as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
  };
  const req = { user: { userId: "u1" }, body } as unknown as Request;
  return ProfileCtrl.updateProfile(req, res as unknown as Response).then(
    () => res as { statusCode: number; body: any },
  );
}

describe("PUT /profile validation", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects a username with a space and names the field", async () => {
    const res = await call({ username: "bad name" });
    expect(res.statusCode).toBe(400);
    expect(res.body.field).toBe("username");
    expect(updateProfile).not.toHaveBeenCalled();
  });

  it("rejects a username with symbols", async () => {
    const res = await call({ username: "a@b!" });
    expect(res.statusCode).toBe(400);
    expect(res.body.field).toBe("username");
  });

  it("lowercases a valid username", async () => {
    const res = await call({ username: "Multi.Role_1" });
    expect(res.statusCode).toBe(200);
    expect(updateProfile).toHaveBeenCalledWith("u1", {
      username: "multi.role_1",
    });
  });

  it("accepts an empty phone so it can be cleared", async () => {
    const res = await call({ phone: "" });
    expect(res.statusCode).toBe(200);
    expect(updateProfile).toHaveBeenCalledWith("u1", { phone: "" });
  });

  it("strips formatting from a valid phone", async () => {
    const res = await call({ phone: "+63 917-123 4567" });
    expect(res.statusCode).toBe(200);
    expect(updateProfile).toHaveBeenCalledWith("u1", {
      phone: "+639171234567",
    });
  });

  it("rejects a phone that is too short or has letters", async () => {
    for (const phone of ["12345", "0917abc4567"]) {
      const res = await call({ phone });
      expect(res.statusCode).toBe(400);
      expect(res.body.field).toBe("phone");
    }
  });

  it("names the username field when it is already taken", async () => {
    updateProfile.mockRejectedValueOnce(new Error("Username already taken"));
    const res = await call({ username: "taken" });
    expect(res.statusCode).toBe(400);
    expect(res.body.field).toBe("username");
  });
});

describe("ProfileSvc.updateProfile phone clearing", () => {
  it("stores an empty phone as null", async () => {
    vi.resetModules();
    vi.doUnmock("../src/modules/profile/profile.service");
    vi.doMock("../src/modules/profile/profile.repository", () => ({
      default: {
        updateProfile: repoUpdate,
        findByUsernameExcludingUserId: findByUsername,
      },
    }));
    vi.doMock("../src/modules/auth/sessions.service", () => ({
      revokeAllSessions: vi.fn(),
    }));
    const { default: Svc } =
      await import("../src/modules/profile/profile.service");
    await Svc.updateProfile("u1", { phone: "" });
    expect(repoUpdate).toHaveBeenCalledWith("u1", { phone: null });
  });
});
