import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { signTestSession } from "./helpers/test-session";

/**
 * An Event is someone's booking, so the approved list is for admins only
 * (api#478).
 */

const findAllApproved = vi.hoisted(() => vi.fn());
vi.mock(
  "../src/modules/event-request/event-request.repository",
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import("../src/modules/event-request/event-request.repository")
      >();
    actual.default.findAllApproved = findAllApproved;
    return actual;
  },
);

import apiApp from "../src/app";

const PATH = "/api/v1/event-requests";

const list = (systemRole?: string, roleType: string[] = []) => {
  const req = request(apiApp).get(PATH);
  return systemRole
    ? req.set(
        "Authorization",
        `Bearer ${signTestSession({ userId: "u1", systemRole, roleType })}`,
      )
    : req;
};

beforeEach(() => {
  findAllApproved.mockReset();
  findAllApproved.mockResolvedValue([{ id: "e1" }]);
});

describe("GET /event-requests", () => {
  it("refuses a signed-out caller", async () => {
    expect((await list()).status).toBe(401);
    expect(findAllApproved).not.toHaveBeenCalled();
  });

  it("refuses a citizen and every Foxer role", async () => {
    const roles = [
      [],
      ["venueFoxer"],
      ["eventFoxer"],
      ["providerFoxer"],
      ["organizer"],
      ["investor"],
    ];
    for (const roleType of roles) {
      expect((await list("user", roleType)).status).toBe(403);
    }
    expect(findAllApproved).not.toHaveBeenCalled();
  });

  it("lets admins read it", async () => {
    for (const role of ["admin", "admin_secretary"]) {
      const res = await list(role);
      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([{ id: "e1" }]);
    }
  });
});
