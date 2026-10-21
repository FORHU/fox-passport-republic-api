import { describe, it, expect } from "vitest";
import UsersRepo from "../src/modules/users/users.repository";
import EventTemplateRepo from "../src/modules/event-template/event-template.repository";

/**
 * The /search page's where-clauses. The search box (`q`) used to match a
 * Foxer's name only and was ignored by the event list; a city from the pickers
 * ("City of Makati") never matched a stored "Makati".
 */

describe("UsersRepo.buildFoxerWhere", () => {
  it("matches a picker-style city on its core name", () => {
    const where = UsersRepo.buildFoxerWhere(
      ["eventFoxer"],
      undefined,
      "City of Makati",
    );
    expect(where.city).toEqual({ contains: "Makati", mode: "insensitive" });
  });

  it("searches name, username, city and event type", () => {
    const where = UsersRepo.buildFoxerWhere(
      ["eventFoxer"],
      undefined,
      undefined,
      undefined,
      "weddings",
    );
    expect(where.AND).toHaveLength(1);
    expect(where.AND?.[0].OR).toEqual(
      expect.arrayContaining([
        { name: { contains: "weddings", mode: "insensitive" } },
        { username: { contains: "weddings", mode: "insensitive" } },
        { city: { contains: "weddings", mode: "insensitive" } },
        {
          foxerSpecializations: {
            some: { category: { in: ["wedding"] } },
          },
        },
      ]),
    );
  });

  it("keeps the search and the price filter when both are set", () => {
    const where = UsersRepo.buildFoxerWhere(
      ["eventFoxer"],
      undefined,
      undefined,
      5000,
      "Makati",
    );
    expect(where.AND).toHaveLength(2);
    expect(where).not.toHaveProperty("OR");
  });

  it("adds no search clauses without a search", () => {
    const where = UsersRepo.buildFoxerWhere(["eventFoxer"]);
    expect(where).not.toHaveProperty("AND");
    expect(where).not.toHaveProperty("city");
  });
});

describe("EventTemplateRepo.buildPublicTemplateWhere", () => {
  it("matches a full place name on the city it starts with", () => {
    const where = EventTemplateRepo.buildPublicTemplateWhere({
      city: "Makati, Metro Manila, Philippines",
    });
    expect(where.AND?.[0]).toEqual({
      OR: [
        { targetCity: { contains: "Makati", mode: "insensitive" } },
        {
          templateVenues: {
            some: {
              venue: { city: { contains: "Makati", mode: "insensitive" } },
            },
          },
        },
      ],
    });
  });

  it("applies the search box to name, host, city and event type", () => {
    const where = EventTemplateRepo.buildPublicTemplateWhere({
      q: "wedding",
    });
    expect(where.AND).toHaveLength(1);
    expect(where.AND?.[0].OR).toEqual(
      expect.arrayContaining([
        { name: { contains: "wedding", mode: "insensitive" } },
        { owner: { name: { contains: "wedding", mode: "insensitive" } } },
        { targetCity: { contains: "wedding", mode: "insensitive" } },
        { category: { in: ["wedding"] } },
      ]),
    );
  });

  it("requires both the city and the search when both are set", () => {
    const where = EventTemplateRepo.buildPublicTemplateWhere({
      city: "City of Makati",
      q: "birthday",
      category: "birthday",
    });
    expect(where.AND).toHaveLength(2);
    expect(where.category).toBe("birthday");
    expect(where.isPublic).toBe(true);
  });

  it("drops an unknown category and adds nothing for empty filters", () => {
    const where = EventTemplateRepo.buildPublicTemplateWhere({
      category: "nonsense",
      q: "  ",
    });
    expect(where).not.toHaveProperty("category");
    expect(where).not.toHaveProperty("AND");
  });
});
