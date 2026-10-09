import express from "express";
import jwt from "jsonwebtoken";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { ACCESS_TOKEN_SECRET } from "../src/config";
import apiApp from "../src/app";
import {
  authenticate,
  requirePermission,
} from "../src/middleware/auth.middleware";

function token(systemRole: "user" | "admin_secretary" | "admin") {
  return jwt.sign(
    {
      userId: `rbac-${systemRole}`,
      email: `${systemRole}@test.local`,
      systemRole,
      roleType: [],
    },
    ACCESS_TOKEN_SECRET,
  );
}

function makeApp() {
  const app = express();
  app.get(
    "/admin/queue",
    authenticate,
    requirePermission("queue:read"),
    (_req, res) => res.status(200).json({ data: "queue" }),
  );
  return app;
}

describe("RBAC HTTP boundary", () => {
  it("rejects an unauthenticated request with 401", async () => {
    const response = await request(makeApp()).get("/admin/queue");

    expect(response.status).toBe(401);
    expect(response.body.message).toBe("No token provided");
  });

  it("rejects an authenticated citizen without queue permission with 403", async () => {
    const response = await request(makeApp())
      .get("/admin/queue")
      .set("Authorization", `Bearer ${token("user")}`);

    expect(response.status).toBe(403);
    expect(response.body.message).toBe("You do not have permission to do that");
  });

  it("allows admin_secretary through to the protected handler with 200", async () => {
    const response = await request(makeApp())
      .get("/admin/queue")
      .set("Authorization", `Bearer ${token("admin_secretary")}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ data: "queue" });
  });

  it("keeps the full admin role allowed through the same capability", async () => {
    const response = await request(makeApp())
      .get("/admin/queue")
      .set("Authorization", `Bearer ${token("admin")}`);

    expect(response.status).toBe(200);
  });
});

describe("mounted admin RBAC boundary", () => {
  it("returns 401 before the admin handler when no token is supplied", async () => {
    const response = await request(apiApp).get("/api/v1/admin/stats");

    expect(response.status).toBe(401);
  });

  it("returns 403 before the admin handler for a citizen", async () => {
    const response = await request(apiApp)
      .get("/api/v1/admin/stats")
      .set("Authorization", `Bearer ${token("user")}`);

    expect(response.status).toBe(403);
  });

  it("allows admin_secretary through the mounted queue capability", async () => {
    const response = await request(apiApp)
      .get("/api/v1/admin/stats")
      .set("Authorization", `Bearer ${token("admin_secretary")}`);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
  });

  it("keeps the citizen list closed to admin_secretary", async () => {
    const response = await request(apiApp)
      .get("/api/v1/users/")
      .set("Authorization", `Bearer ${token("admin_secretary")}`);

    expect(response.status).toBe(403);
  });
});
