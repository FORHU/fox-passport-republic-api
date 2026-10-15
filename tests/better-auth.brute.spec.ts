import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import app from "../src/app";
import { prisma } from "../src/utils/prisma";

describe("Better Auth - Exhaustive Flow & Brute Security Tests", () => {
  const testEmail = `brute.test.${Date.now()}@example.com`;
  const testPassword = "SuperSecurePassword123!";
  const testName = "Brute Tester";

  let sessionToken: string;
  let userId: string;
  let sessionCookies: string[] = [];

  beforeAll(async () => {
    // Clean up any lingering test records
    await prisma.session.deleteMany({
      where: { user: { email: { startsWith: "brute.test." } } },
    });
    await prisma.account.deleteMany({
      where: { user: { email: { startsWith: "brute.test." } } },
    });
    await prisma.user.deleteMany({
      where: { email: { startsWith: "brute.test." } },
    });
  });

  afterAll(async () => {
    // Teardown test artifacts
    await prisma.session.deleteMany({
      where: { user: { email: { startsWith: "brute.test." } } },
    });
    await prisma.account.deleteMany({
      where: { user: { email: { startsWith: "brute.test." } } },
    });
    await prisma.user.deleteMany({
      where: { email: { startsWith: "brute.test." } },
    });
  });

  describe("1. Sign-Up and Dual Mounting Flow", () => {
    it("should successfully sign up a new user via /api/auth/sign-up/email", async () => {
      const res = await request(app)
        .post("/api/auth/sign-up/email")
        .send({
          email: testEmail,
          password: testPassword,
          name: testName,
        });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("token");
      expect(res.body).toHaveProperty("user");
      expect(res.body.user.email).toBe(testEmail);

      sessionToken = res.body.token;
      userId = res.body.user.id;
      sessionCookies = res.headers["set-cookie"] as unknown as string[];

      // Verify persistence in PostgreSQL
      const dbUser = await prisma.user.findUnique({ where: { email: testEmail } });
      expect(dbUser).toBeDefined();
      expect(dbUser?.email).toBe(testEmail);

      const dbSession = await prisma.session.findUnique({ where: { token: sessionToken } });
      expect(dbSession).toBeDefined();
      expect(dbSession?.userId).toBe(userId);
    });

    it("should confirm dual-mount: /api/v1/auth/sign-in/email also responds to Better Auth", async () => {
      // Test the alias mount on /api/v1/auth/*
      const res = await request(app)
        .post("/api/v1/auth/sign-in/email")
        .send({
          email: testEmail,
          password: testPassword,
        });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("token");
      expect(res.body.user.email).toBe(testEmail);
    });
  });

  describe("2. Authentication Middleware & Session Verification", () => {
    it("should return the session via /api/auth/get-session", async () => {
      const res = await request(app)
        .get("/api/auth/get-session")
        .set("Authorization", `Bearer ${sessionToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("session");
      expect(res.body).toHaveProperty("user");
      expect(res.body.user.email).toBe(testEmail);
    });

    it("should allow access to protected profile route with Bearer token header", async () => {
      const res = await request(app)
        .get("/api/v1/profile")
        .set("Authorization", `Bearer ${sessionToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(userId);
      expect(res.body.data.email).toBe(testEmail);
    });

    it("should allow access to protected profile route with better-auth signed session cookie", async () => {
      const res = await request(app)
        .get("/api/v1/profile")
        .set("Cookie", sessionCookies);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(userId);
      expect(res.body.data.email).toBe(testEmail);
    });
  });

  describe("3. Brute-Force Password Stress & Invalid Login Rejections", () => {
    it("should firmly reject 20 consecutive brute-force attempts with wrong passwords", async () => {
      const badAttempts = Array.from({ length: 20 }, (_, i) => `wrong_pwd_${i}!`);

      for (const badPassword of badAttempts) {
        const res = await request(app)
          .post("/api/auth/sign-in/email")
          .send({
            email: testEmail,
            password: badPassword,
          });

        expect(res.status).toBeGreaterThanOrEqual(400);
        expect(res.body).not.toHaveProperty("token");
      }
    });

    it("should reject sign-in for non-existent email", async () => {
      const res = await request(app)
        .post("/api/auth/sign-in/email")
        .send({
          email: "nonexistent.ghost.user@example.com",
          password: "RandomPassword123!",
        });

      expect(res.status).toBeGreaterThanOrEqual(400);
    });

    it("should immediately succeed when correct credentials are provided after brute attempts", async () => {
      const res = await request(app)
        .post("/api/auth/sign-in/email")
        .send({
          email: testEmail,
          password: testPassword,
        });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("token");
      // Update session token for downstream checks
      sessionToken = res.body.token;
    });
  });

  describe("4. Token Tampering, Fuzzing & Malformed Header Handling", () => {
    const invalidHeaders = [
      { name: "Missing Authorization header", header: {} },
      { name: "Empty Bearer token", header: { Authorization: "Bearer " } },
      { name: "Whitespace only Bearer", header: { Authorization: "Bearer    " } },
      { name: "Forged UUID token", header: { Authorization: "Bearer 00000000-0000-0000-0000-000000000000" } },
      { name: "SQL Injection attack in token", header: { Authorization: "Bearer ' OR '1'='1" } },
      { name: "XSS attempt in token", header: { Authorization: "Bearer <script>alert(1)</script>" } },
      { name: "Oversized buffer attack (4KB token)", header: { Authorization: `Bearer ${"x".repeat(4000)}` } },
      { name: "Unsupported scheme (Basic auth)", header: { Authorization: "Basic dXNlcjpwYXNz" } },
      { name: "Malformed cookie", header: { Cookie: "better-auth.session_token=forged_bad_token" } },
    ];

    for (const { name, header } of invalidHeaders) {
      it(`should reject ${name} with 401 without crashing`, async () => {
        const req = request(app).get("/api/v1/profile");
        for (const [key, val] of Object.entries(header)) {
          req.set(key, val);
        }
        const res = await req;
        expect(res.status).toBe(401);
        expect(res.body.success).toBe(false);
      });
    }
  });

  describe("5. High-Concurrency Stress Test", () => {
    it("should handle 30 concurrent authenticated requests simultaneously without failure", async () => {
      const concurrentRequests = Array.from({ length: 30 }, () =>
        request(app)
          .get("/api/v1/profile")
          .set("Authorization", `Bearer ${sessionToken}`)
      );

      const results = await Promise.all(concurrentRequests);

      for (const res of results) {
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data.email).toBe(testEmail);
      }
    });
  });

  describe("6. Sign-Out & Post-Revocation Invalidation Flow", () => {
    it("should sign out via /api/auth/sign-out and revoke the session", async () => {
      const res = await request(app)
        .post("/api/auth/sign-out")
        .set("Authorization", `Bearer ${sessionToken}`);

      expect(res.status).toBe(200);

      // Verify the session was deleted or invalidated in database
      const dbSession = await prisma.session.findUnique({
        where: { token: sessionToken },
      });
      expect(dbSession).toBeNull();
    });

    it("should reject the revoked session token on subsequent protected calls", async () => {
      const res = await request(app)
        .get("/api/v1/profile")
        .set("Authorization", `Bearer ${sessionToken}`);

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it("should return null/empty session when calling /api/auth/get-session with revoked token", async () => {
      const res = await request(app)
        .get("/api/auth/get-session")
        .set("Authorization", `Bearer ${sessionToken}`);

      // Better Auth returns null or empty for revoked/invalid sessions
      expect(res.body === null || res.body.session === null || !res.body.session).toBe(true);
    });
  });
});
