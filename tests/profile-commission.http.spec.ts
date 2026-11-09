import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import { signTestSession } from "./helpers/test-session";

/**
 * #264 T5: the EventFoxer's commission rate over HTTP. Only a session with
 * `template:manage` (the eventFoxer role) reaches the service; a citizen gets
 * 403, and a bad body answers 400. The service is stubbed: the routes, guards
 * and validation are real.
 */

const svc = vi.hoisted(() => ({
  getCommission: vi.fn(async () => ({ commissionPct: 10 })),
  setCommission: vi.fn(async (_userId: string, commissionPct: number) => ({
    commissionPct,
    previousCommissionPct: 10,
    eventsKeepingTheirRate: [],
  })),
}));
vi.mock("../src/modules/profile/profile.service", () => ({
  default: svc,
  USERNAME_TAKEN: "Username already taken",
}));

const { default: app } = await import("../src/app");

function bearer(roleType: ("eventFoxer" | "venueFoxer")[]) {
  const who = roleType[0] ?? "citizen";
  return `Bearer ${signTestSession({
    userId: `commission-${who}`,
    email: `${who}@test.local`,
    systemRole: "user",
    roleType,
  })}`;
}

beforeEach(() => vi.clearAllMocks());

describe("GET /api/v1/profile/commission", () => {
  it("returns the EventFoxer's rate", async () => {
    const res = await request(app)
      .get("/api/v1/profile/commission")
      .set("Authorization", bearer(["eventFoxer"]));

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ commissionPct: 10 });
    expect(svc.getCommission).toHaveBeenCalledWith("commission-eventFoxer");
  });

  it("answers 401 without a session", async () => {
    const res = await request(app).get("/api/v1/profile/commission");
    expect(res.status).toBe(401);
  });

  it.each([[[]], [["venueFoxer"]]] as const)(
    "answers 403 for roleType %j, who can't build templates",
    async (roleType) => {
      const res = await request(app)
        .get("/api/v1/profile/commission")
        .set("Authorization", bearer([...roleType]));
      expect(res.status).toBe(403);
      expect(svc.getCommission).not.toHaveBeenCalled();
    },
  );
});

describe("PUT /api/v1/profile/commission", () => {
  it("sets the rate and passes the actor for the audit log", async () => {
    const res = await request(app)
      .put("/api/v1/profile/commission")
      .set("Authorization", bearer(["eventFoxer"]))
      .send({ commissionPct: 12.5 });

    expect(res.status).toBe(200);
    expect(res.body.data.commissionPct).toBe(12.5);
    expect(svc.setCommission).toHaveBeenCalledWith(
      "commission-eventFoxer",
      12.5,
      { userId: "commission-eventFoxer", email: "eventFoxer@test.local" },
    );
  });

  it.each([0, 100])("accepts %d", async (commissionPct) => {
    const res = await request(app)
      .put("/api/v1/profile/commission")
      .set("Authorization", bearer(["eventFoxer"]))
      .send({ commissionPct });
    expect(res.status).toBe(200);
  });

  it.each([
    [{ commissionPct: -1 }, /below 0%/],
    [{ commissionPct: 101 }, /above 100%/],
    [{ commissionPct: 10.555 }, /at most 2 decimals/],
    [{ commissionPct: "10" }, /as a number/],
    [{ commissionPct: 0.1 * 3 }, /at most 2 decimals/],
    [{}, /required/],
  ])("answers 400 for %j", async (body, message) => {
    const res = await request(app)
      .put("/api/v1/profile/commission")
      .set("Authorization", bearer(["eventFoxer"]))
      .send(body);

    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).toMatch(message);
    expect(svc.setCommission).not.toHaveBeenCalled();
  });

  it("answers 403 for a citizen", async () => {
    const res = await request(app)
      .put("/api/v1/profile/commission")
      .set("Authorization", bearer([]))
      .send({ commissionPct: 10 });
    expect(res.status).toBe(403);
    expect(svc.setCommission).not.toHaveBeenCalled();
  });
});
