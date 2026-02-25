import { expect } from "chai";
import request from "supertest";
import app from "../src/app";
import { describe, it } from "mocha";

describe("API Integration Tests", () => {
    it("should say welcome", async () => {
        const res = await request(app).get("/api/v1");
        expect(res.status).to.equal(200);
        expect(res.text).to.include("Welcome to my API");
    });

    it("should fetch venues", async () => {
        const res = await request(app).get("/api/v1/venues");
        expect(res.status).to.equal(200);
        expect(res.body.success).to.be.true;
    });
});
