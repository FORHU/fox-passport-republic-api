import { describe, it, expect } from "vitest";
import request from "supertest";
import app from "../src/app";

describe("App", () => {
  it("should return a welcome message", async () => {
    const res = await request(app).get("/api/v1");
    expect(res.status).toBe(200);
    expect(res.text).toContain("Welcome to my API");
  });

  it("should expose a health endpoint", async () => {
    const res = await request(app).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok" });
  });

  it("should 404 unknown API routes as JSON", async () => {
    const res = await request(app).get("/api/v1/definitely-not-a-route");
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });
});
