import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import { signTestSession } from "./helpers/test-session";

/**
 * BUG-19 (api#163): category writes over HTTP. Only a session holding
 * `categories:manage` (the admin role) reaches the service; everyone else is
 * refused before it, and a bad body answers 400 with per-field errors the
 * admin form can show. The service is stubbed: the routes, guards and
 * validation are real.
 */

const svc = vi.hoisted(() => ({
  createCategory: vi.fn(async (data: Record<string, unknown>) => ({
    id: "new-id",
    ...data,
  })),
  updateCategory: vi.fn(async (id: string, data: Record<string, unknown>) => ({
    id,
    ...data,
  })),
}));
vi.mock("../src/modules/category/category.service", () => ({ default: svc }));

const { default: app } = await import("../src/app");

const ID = "00000000-0000-4000-8000-000000000010";
const PARENT = "00000000-0000-4000-8000-000000000001";

function bearer(systemRole: "user" | "admin_secretary" | "admin") {
  return `Bearer ${signTestSession({
    userId: `cat-${systemRole}`,
    email: `${systemRole}@test.local`,
    systemRole,
    roleType: [],
  })}`;
}

const valid = {
  name: "Pool Party",
  slug: "pool_party",
  parentCategoryId: PARENT,
};

beforeEach(() => vi.clearAllMocks());

describe("POST /api/v1/categories/create", () => {
  it("creates for an admin and passes the actor for the audit log", async () => {
    const res = await request(app)
      .post("/api/v1/categories/create")
      .set("Authorization", bearer("admin"))
      .send({ ...valid, description: "" });

    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ id: "new-id", slug: "pool_party" });
    expect(svc.createCategory).toHaveBeenCalledWith(
      { ...valid, description: null },
      { userId: "cat-admin", email: "admin@test.local" },
    );
  });

  it("answers 401 without a session", async () => {
    const res = await request(app)
      .post("/api/v1/categories/create")
      .send(valid);

    expect(res.status).toBe(401);
    expect(svc.createCategory).not.toHaveBeenCalled();
  });

  it.each(["user", "admin_secretary"] as const)(
    "answers 403 for %s, who lacks categories:manage",
    async (role) => {
      const res = await request(app)
        .post("/api/v1/categories/create")
        .set("Authorization", bearer(role))
        .send(valid);

      expect(res.status).toBe(403);
      expect(svc.createCategory).not.toHaveBeenCalled();
    },
  );

  it("answers 400 with every field error for an invalid body", async () => {
    const res = await request(app)
      .post("/api/v1/categories/create")
      .set("Authorization", bearer("admin"))
      .send({ name: "x", slug: "Bad Slug!" });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("VALIDATION");
    const fields = res.body.fields.map((f: { field: string }) => f.field);
    expect(fields).toEqual(
      expect.arrayContaining(["name", "slug", "parentCategoryId"]),
    );
    expect(svc.createCategory).not.toHaveBeenCalled();
  });
});

describe("PUT /api/v1/categories/:id", () => {
  it("updates for an admin", async () => {
    const res = await request(app)
      .put(`/api/v1/categories/${ID}`)
      .set("Authorization", bearer("admin"))
      .send({ name: "Birthdays", icon: "cake" });

    expect(res.status).toBe(200);
    expect(svc.updateCategory).toHaveBeenCalledWith(
      ID,
      { name: "Birthdays", icon: "cake" },
      { userId: "cat-admin", email: "admin@test.local" },
    );
  });

  it("answers 403 for admin_secretary", async () => {
    const res = await request(app)
      .put(`/api/v1/categories/${ID}`)
      .set("Authorization", bearer("admin_secretary"))
      .send({ name: "Birthdays" });

    expect(res.status).toBe(403);
    expect(svc.updateCategory).not.toHaveBeenCalled();
  });

  it("refuses a slug in the body: slugs are fixed at creation", async () => {
    const res = await request(app)
      .put(`/api/v1/categories/${ID}`)
      .set("Authorization", bearer("admin"))
      .send({ slug: "bday" });

    expect(res.status).toBe(400);
    expect(res.body.fields.map((f: { field: string }) => f.field)).toContain(
      "slug",
    );
    expect(svc.updateCategory).not.toHaveBeenCalled();
  });

  it("refuses an empty body", async () => {
    const res = await request(app)
      .put(`/api/v1/categories/${ID}`)
      .set("Authorization", bearer("admin"))
      .send({});

    expect(res.status).toBe(400);
    expect(svc.updateCategory).not.toHaveBeenCalled();
  });
});
