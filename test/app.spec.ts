import { expect } from "chai";
import request from "supertest";
import app from "../src/app";
import { describe, it } from "mocha";

describe("App", () => {
  it("should return a welcome message", async () => {
    const res = await request(app).get("/api/v1/healthcheck");
    expect(res.status).to.equal(200);
    expect(res.body).to.have.property("health_check", "success");
  });
});
