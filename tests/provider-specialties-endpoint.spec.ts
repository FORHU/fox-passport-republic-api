import { describe, it, expect, vi } from "vitest";
import request from "supertest";

/**
 * RR-3 follow-up: the apps read the valid Provider specialties from one place
 * instead of hardcoding them. Public like the rest of the category reads.
 */

const list = vi.hoisted(() => vi.fn());
vi.mock("../src/modules/users/provider-specialty.service", () => ({
  default: { list },
}));

const { default: app } = await import("../src/app");

describe("GET /api/v1/categories/provider-specialties", () => {
  it("returns the catalog specialties as { slug, name }", async () => {
    list.mockResolvedValue([
      { slug: "dj", name: "DJ" },
      { slug: "photography", name: "Photography" },
    ]);

    const res = await request(app).get(
      "/api/v1/categories/provider-specialties",
    );

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      success: true,
      count: 2,
      data: [
        { slug: "dj", name: "DJ" },
        { slug: "photography", name: "Photography" },
      ],
    });
  });

  it("is not read as a category id", async () => {
    list.mockResolvedValue([]);
    const res = await request(app).get(
      "/api/v1/categories/provider-specialties",
    );
    expect(res.status).toBe(200);
    expect(list).toHaveBeenCalled();
  });
});
