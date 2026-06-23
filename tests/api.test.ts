import { expect } from "chai";
import request from "supertest";
import app from "../src/app";
import { describe, it } from "mocha";

// helpers for auth tests
import { prisma } from "../src/utils/prisma";
import jwt from "jsonwebtoken";
import { ACCESS_TOKEN_SECRET } from "../src/config";

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

// -------------------------------------------
// authentication / asset route tests
// -------------------------------------------
describe("Asset creation endpoint", () => {
    let user: any;
    let token: string;

    before(async () => {
        // create a fresh user for testing
        user = await prisma.user.create({
            data: { email: "apiowner@example.com", password: "pass", name: "Api Owner" },
        });
        token = jwt.sign({ userId: user.id, email: user.email }, ACCESS_TOKEN_SECRET, {
            expiresIn: "1h",
        });
    });

    after(async () => {
        await prisma.asset.deleteMany({});
        await prisma.user.delete({ where: { id: user.id } });
        await prisma.$disconnect();
    });

    it("rejects creation when no token provided", async () => {
        const res = await request(app)
            .post("/api/v1/assets/create")
            .send({ name: "Foo", description: "Bar", hostId: user.id });
        expect(res.status).to.equal(401);
        expect(res.body.message).to.match(/no token|invalid/i);
    });

    it("creates asset when token is valid", async () => {
        const res = await request(app)
            .post("/api/v1/assets/create")
            .set("Authorization", `Bearer ${token}`)
            .send({ name: "Foo", description: "Bar", hostId: user.id, categoryId: 2 });
        expect(res.status).to.equal(201);
        expect(res.body.asset).to.have.property("id");
        expect(res.body.asset.ownerId).to.equal(user.id);
        expect(res.body.asset.categoryId).to.equal(2);
    });

    it("accepts numeric string for categoryId by converting", async () => {
        const res = await request(app)
            .post("/api/v1/assets/create")
            .set("Authorization", `Bearer ${token}`)
            .send({ name: "Foo", description: "Bar", hostId: user.id, categoryId: "3" });
        expect(res.status).to.equal(201);
        expect(res.body.asset).to.have.property("id");
        expect(res.body.asset.categoryId).to.equal(3);
    });

    it("accepts categorySlug and resolves to id", async () => {
        // ensure there is a category with slug 'equipment' seeded
        const res = await request(app)
            .post("/api/v1/assets/create")
            .set("Authorization", `Bearer ${token}`)
            .send({ name: "Foo", description: "Bar", hostId: user.id, categorySlug: "equipment" });
        expect(res.status).to.equal(201);
        expect(res.body.asset).to.have.property("id");
        // the seeded equipment category has id 1 or check dynamically
        expect(res.body.asset.categoryId).to.be.a("number");
    });

    it("rejects non-numeric categoryId", async () => {
        const res = await request(app)
            .post("/api/v1/assets/create")
            .set("Authorization", `Bearer ${token}`)
            .send({ name: "Foo", description: "Bar", hostId: user.id, categoryId: "not-a-number" });
        expect(res.status).to.equal(400);
        // Joi includes quotes around the field name in its message
        expect(res.body.message).to.match(/["']?categoryId["']? must be a number/i);
    });
});
