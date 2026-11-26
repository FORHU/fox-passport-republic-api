import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import { signTestSession } from "./helpers/test-session";

/**
 * api#440: a Provider applicant can ask for a specialty the catalog lacks.
 * The request stays pending and is never a valid specialty; only someone
 * with `categories:manage` approves it, which creates the listing
 * subcategory the apply form and checks read. The repositories are stubbed;
 * the routes, guards, validation and service decisions are real.
 */

const audit = vi.hoisted(() => ({ recordChange: vi.fn(async () => {}) }));
vi.mock("../src/modules/audit/audit.service", () => audit);

const LISTING_ROOT = "00000000-0000-4000-8000-000000000002";
const SUGGESTION = "00000000-0000-4000-8000-000000000020";

const categoryRepo = vi.hoisted(() => ({
  slugExists: vi.fn(async () => false),
  getTopLevelCategories: vi.fn(async () => [
    { id: "00000000-0000-4000-8000-000000000001", slug: "event" },
    { id: "00000000-0000-4000-8000-000000000002", slug: "listing" },
  ]),
  invalidateAll: vi.fn(async () => {}),
  getProviderGroups: vi.fn(async () => [
    {
      id: "00000000-0000-4000-8000-000000000003",
      slug: "photo_video",
      name: "Photo & Video",
      icon: null,
    },
  ]),
}));
vi.mock("../src/modules/category/category.repository", () => ({
  default: categoryRepo,
}));

const repo = vi.hoisted(() => ({
  findById: vi.fn(),
  findPendingBySlug: vi.fn(async () => null),
  countPendingBy: vi.fn(async () => 0),
  create: vi.fn(async (data: Record<string, unknown>) => ({
    id: "new-suggestion",
    status: "pending",
    ...data,
  })),
  list: vi.fn(async () => []),
  approve: vi.fn(async (input: Record<string, unknown>) => ({
    id: "new-category",
    slug: input.slug,
    name: input.name,
    parentCategoryId: input.listingRootId,
  })),
  reject: vi.fn(async (id: string) => ({ id, status: "rejected" })),
}));
vi.mock("../src/modules/category/specialty-suggestion.repository", () => ({
  default: repo,
}));

vi.mock("../src/infrastructure/socket/invalidate", () => ({
  announceAdminQueueChanged: vi.fn(),
}));

const { default: app } = await import("../src/app");
const { toSpecialtySlug, MAX_PENDING_PER_USER } =
  await import("../src/modules/category/specialty-suggestion.service");

const BASE = "/api/v1/categories/provider-specialties/suggestions";

function bearer(systemRole: "user" | "admin") {
  return `Bearer ${signTestSession({
    userId: `sugg-${systemRole}`,
    email: `${systemRole}@test.local`,
    systemRole,
    roleType: [],
  })}`;
}

const pendingRow = {
  id: SUGGESTION,
  name: "Drone Photography",
  slug: "drone_photography",
  status: "pending",
  suggestedById: "sugg-user",
};

beforeEach(() => {
  vi.clearAllMocks();
  categoryRepo.slugExists.mockResolvedValue(false);
  repo.findPendingBySlug.mockResolvedValue(null);
  repo.countPendingBy.mockResolvedValue(0);
  repo.findById.mockResolvedValue(pendingRow);
});

describe("toSpecialtySlug", () => {
  it("turns a name into a listing-style slug", () => {
    expect(toSpecialtySlug("  Drone Photography! ")).toBe("drone_photography");
    expect(toSpecialtySlug("Café & Bar")).toBe("cafe_bar");
    expect(toSpecialtySlug("Lights/Sound -- Rig")).toBe("lights_sound_rig");
    expect(toSpecialtySlug("日本語")).toBe("");
  });
});

describe(`POST ${BASE}`, () => {
  it("needs a session", async () => {
    const res = await request(app).post(BASE).send({ name: "Drone" });
    expect(res.status).toBe(401);
    expect(repo.create).not.toHaveBeenCalled();
  });

  it("records a pending request for any signed-in person", async () => {
    const res = await request(app)
      .post(BASE)
      .set("Authorization", bearer("user"))
      .send({ name: "  Drone   Photography " });

    expect(res.status).toBe(201);
    expect(repo.create).toHaveBeenCalledWith({
      name: "Drone Photography",
      slug: "drone_photography",
      suggestedById: "sugg-user",
    });
    expect(res.body.data).toMatchObject({ status: "pending" });
    // A request never touches the catalog.
    expect(repo.approve).not.toHaveBeenCalled();
    expect(categoryRepo.invalidateAll).not.toHaveBeenCalled();
  });

  it("returns the open request instead of a duplicate", async () => {
    repo.findPendingBySlug.mockResolvedValue(pendingRow);

    const res = await request(app)
      .post(BASE)
      .set("Authorization", bearer("user"))
      .send({ name: "drone photography" });

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ id: SUGGESTION });
    expect(repo.create).not.toHaveBeenCalled();
  });

  it("refuses a specialty already in the catalog with 409", async () => {
    categoryRepo.slugExists.mockResolvedValue(true);

    const res = await request(app)
      .post(BASE)
      .set("Authorization", bearer("user"))
      .send({ name: "DJ" });

    expect(res.status).toBe(409);
    expect(repo.create).not.toHaveBeenCalled();
  });

  it("refuses a venue category with 409", async () => {
    const res = await request(app)
      .post(BASE)
      .set("Authorization", bearer("user"))
      .send({ name: "Beach Resort" });

    expect(res.status).toBe(409);
    expect(repo.create).not.toHaveBeenCalled();
  });

  it("refuses a name with no usable characters, and a missing name, with 400", async () => {
    for (const body of [{ name: "日本語" }, {}]) {
      const res = await request(app)
        .post(BASE)
        .set("Authorization", bearer("user"))
        .send(body);
      expect(res.status).toBe(400);
    }
    expect(repo.create).not.toHaveBeenCalled();
  });

  it("caps open requests per person", async () => {
    repo.countPendingBy.mockResolvedValue(MAX_PENDING_PER_USER);

    const res = await request(app)
      .post(BASE)
      .set("Authorization", bearer("user"))
      .send({ name: "Drone Photography" });

    expect(res.status).toBe(400);
    expect(repo.create).not.toHaveBeenCalled();
  });
});

describe("reviewing suggestions", () => {
  it("is refused for a person without categories:manage", async () => {
    const user = bearer("user");
    const responses = await Promise.all([
      request(app).get(BASE).set("Authorization", user),
      request(app)
        .post(`${BASE}/${SUGGESTION}/approve`)
        .set("Authorization", user),
      request(app)
        .post(`${BASE}/${SUGGESTION}/reject`)
        .set("Authorization", user),
    ]);

    for (const res of responses) expect(res.status).toBe(403);
    expect(repo.list).not.toHaveBeenCalled();
    expect(repo.approve).not.toHaveBeenCalled();
    expect(repo.reject).not.toHaveBeenCalled();
  });

  it("lists the pending queue for an admin", async () => {
    repo.list.mockResolvedValue([pendingRow]);

    const res = await request(app)
      .get(BASE)
      .set("Authorization", bearer("admin"));

    expect(res.status).toBe(200);
    expect(repo.list).toHaveBeenCalledWith("pending");
    expect(res.body).toMatchObject({ count: 1 });
  });

  it("approves into the catalog under listing, drops the cache and audits it", async () => {
    const res = await request(app)
      .post(`${BASE}/${SUGGESTION}/approve`)
      .set("Authorization", bearer("admin"))
      .send({ name: "Aerial Photography" });

    expect(res.status).toBe(200);
    expect(repo.approve).toHaveBeenCalledWith({
      slug: "drone_photography",
      name: "Aerial Photography",
      parentCategoryId: LISTING_ROOT,
      reviewerId: "sugg-admin",
    });
    expect(categoryRepo.invalidateAll).toHaveBeenCalledTimes(1);
    expect(audit.recordChange).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "sugg-admin" }),
      "category.create",
      "new-category",
      expect.objectContaining({ fromSuggestion: SUGGESTION }),
    );
  });

  it("approves under the main category the reviewer picks (api#503)", async () => {
    const res = await request(app)
      .post(`${BASE}/${SUGGESTION}/approve`)
      .set("Authorization", bearer("admin"))
      .send({ group: "photo_video" });

    expect(res.status).toBe(200);
    expect(repo.approve).toHaveBeenCalledWith(
      expect.objectContaining({
        parentCategoryId: "00000000-0000-4000-8000-000000000003",
      }),
    );
  });

  it("refuses a main category that doesn't exist", async () => {
    const res = await request(app)
      .post(`${BASE}/${SUGGESTION}/approve`)
      .set("Authorization", bearer("admin"))
      .send({ group: "plumbing" });

    expect(res.status).toBe(400);
    expect(repo.approve).not.toHaveBeenCalled();
  });

  it("keeps the asked-for name when the reviewer gives none", async () => {
    await request(app)
      .post(`${BASE}/${SUGGESTION}/approve`)
      .set("Authorization", bearer("admin"));

    expect(repo.approve).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Drone Photography" }),
    );
  });

  it("refuses to approve when the slug was added to the catalog meanwhile", async () => {
    categoryRepo.slugExists.mockResolvedValue(true);

    const res = await request(app)
      .post(`${BASE}/${SUGGESTION}/approve`)
      .set("Authorization", bearer("admin"));

    expect(res.status).toBe(409);
    expect(repo.approve).not.toHaveBeenCalled();
  });

  it("refuses to review twice, and answers 404 for an unknown id", async () => {
    repo.findById.mockResolvedValueOnce({ ...pendingRow, status: "rejected" });
    const twice = await request(app)
      .post(`${BASE}/${SUGGESTION}/approve`)
      .set("Authorization", bearer("admin"));
    expect(twice.status).toBe(409);

    repo.findById.mockResolvedValueOnce(null);
    const missing = await request(app)
      .post(`${BASE}/${SUGGESTION}/reject`)
      .set("Authorization", bearer("admin"));
    expect(missing.status).toBe(404);

    expect(repo.approve).not.toHaveBeenCalled();
    expect(repo.reject).not.toHaveBeenCalled();
  });

  it("rejects a pending suggestion and audits it", async () => {
    const res = await request(app)
      .post(`${BASE}/${SUGGESTION}/reject`)
      .set("Authorization", bearer("admin"));

    expect(res.status).toBe(200);
    expect(repo.reject).toHaveBeenCalledWith(SUGGESTION, "sugg-admin");
    expect(audit.recordChange).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "sugg-admin" }),
      "specialty_suggestion.reject",
      SUGGESTION,
      expect.anything(),
    );
    expect(categoryRepo.invalidateAll).not.toHaveBeenCalled();
  });
});
