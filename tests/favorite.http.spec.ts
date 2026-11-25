import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import { signTestSession } from "./helpers/test-session";

/**
 * app#313: favourites accept a Foxer (`type: "foxer"`, `targetId` = the
 * Foxer's user id) next to venues and events, and reject any other type on
 * add, remove and check. The service is stubbed: the routes, auth and input
 * validation are real.
 */

const svc = vi.hoisted(() => ({
  toggleFavorite: vi.fn(),
  getUserFavorites: vi.fn(async () => []),
  checkFavorite: vi.fn(async () => true),
  addFavorite: vi.fn(async () => ({ added: true })),
  removeFavorite: vi.fn(),
  removeFavoriteByListing: vi.fn(async () => ({ count: 1 })),
}));
vi.mock("../src/modules/favorite/favorite.service", () => ({ default: svc }));

const { default: app } = await import("../src/app");

const USER = "favorite-citizen";
const bearer = `Bearer ${signTestSession({
  userId: USER,
  email: "favorite@test.local",
  systemRole: "user",
  roleType: [],
})}`;

beforeEach(() => vi.clearAllMocks());

describe("POST /api/v1/favorites/add", () => {
  it.each(["venue", "event", "foxer"])("adds a %s", async (type) => {
    const res = await request(app)
      .post("/api/v1/favorites/add")
      .set("Authorization", bearer)
      .send({ targetId: "t-1", type });

    expect(res.status).toBe(201);
    expect(svc.addFavorite).toHaveBeenCalledWith(USER, "t-1", type);
  });

  it.each([
    [{ targetId: "t-1", type: "user" }],
    [{ targetId: "t-1" }],
    [{ type: "foxer" }],
    [{ targetId: 42, type: "foxer" }],
  ])("answers 400 for %j", async (body) => {
    const res = await request(app)
      .post("/api/v1/favorites/add")
      .set("Authorization", bearer)
      .send(body);

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/'foxer'/);
    expect(svc.addFavorite).not.toHaveBeenCalled();
  });

  it("answers 400 with the service's message for an unknown Foxer", async () => {
    svc.addFavorite.mockRejectedValueOnce(new Error("Foxer not found"));
    const res = await request(app)
      .post("/api/v1/favorites/add")
      .set("Authorization", bearer)
      .send({ targetId: "nobody", type: "foxer" });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe("Foxer not found");
  });

  it("answers 401 without a session", async () => {
    const res = await request(app)
      .post("/api/v1/favorites/add")
      .send({ targetId: "t-1", type: "foxer" });
    expect(res.status).toBe(401);
  });
});

describe("DELETE /api/v1/favorites/:id", () => {
  // api#455: deleting by id is scoped to the signed-in user.
  it("passes the caller to the service", async () => {
    const res = await request(app)
      .delete("/api/v1/favorites/fav-1")
      .set("Authorization", bearer);

    expect(res.status).toBe(200);
    expect(svc.removeFavorite).toHaveBeenCalledWith("fav-1", USER);
  });

  it("answers 404 for someone else's favourite", async () => {
    const { notFound } = await import("../src/utils/errors");
    svc.removeFavorite.mockRejectedValueOnce(notFound("Favorite"));

    const res = await request(app)
      .delete("/api/v1/favorites/fav-of-another")
      .set("Authorization", bearer);

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });
});

describe("DELETE /api/v1/favorites/remove/listing", () => {
  it("removes a Foxer", async () => {
    const res = await request(app)
      .delete("/api/v1/favorites/remove/listing")
      .set("Authorization", bearer)
      .send({ targetId: "fox-1", type: "foxer" });

    expect(res.status).toBe(200);
    expect(svc.removeFavoriteByListing).toHaveBeenCalledWith(
      USER,
      "fox-1",
      "foxer",
    );
  });

  it("answers 400 for an unknown type", async () => {
    const res = await request(app)
      .delete("/api/v1/favorites/remove/listing")
      .set("Authorization", bearer)
      .send({ targetId: "fox-1", type: "user" });

    expect(res.status).toBe(400);
    expect(svc.removeFavoriteByListing).not.toHaveBeenCalled();
  });
});

describe("GET /api/v1/favorites/check", () => {
  it("checks a Foxer", async () => {
    const res = await request(app)
      .get("/api/v1/favorites/check")
      .query({ targetId: "fox-1", type: "foxer" })
      .set("Authorization", bearer);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ isFavorite: true });
    expect(svc.checkFavorite).toHaveBeenCalledWith(USER, "fox-1", "foxer");
  });

  it("answers 400 for an unknown type", async () => {
    const res = await request(app)
      .get("/api/v1/favorites/check")
      .query({ targetId: "fox-1", type: "user" })
      .set("Authorization", bearer);

    expect(res.status).toBe(400);
    expect(svc.checkFavorite).not.toHaveBeenCalled();
  });
});
