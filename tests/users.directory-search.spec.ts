import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Request, Response } from "express";
import UsersRepo from "../src/modules/users/users.repository";
import { roleTypesMatching } from "../src/utils/search-terms";

const svc = vi.hoisted(() => ({ getAllUsers: vi.fn() }));
vi.mock("../src/modules/users/users.service", () => ({ default: svc }));

import UsersCtrl from "../src/modules/users/users.controller";

/**
 * The admin citizen directory (`GET /users`). Searching "investor" matched
 * only names, emails and usernames containing the word - never the investors
 * themselves - and an unknown `roleType` filter reached Prisma and 500'd.
 */

describe("roleTypesMatching", () => {
  it("names a role however it is typed", () => {
    expect(roleTypesMatching("investor")).toEqual(["investor"]);
    expect(roleTypesMatching("Investors")).toEqual(["investor"]);
    expect(roleTypesMatching("venue foxer")).toEqual(["venueFoxer"]);
    expect(roleTypesMatching("event-foxers")).toEqual(["eventFoxer"]);
    expect(roleTypesMatching("provider")).toEqual(["providerFoxer"]);
  });

  it("finds Providers by the retired supply role names", () => {
    expect(roleTypesMatching("gear")).toEqual(["providerFoxer"]);
    expect(roleTypesMatching("Talent Foxers")).toEqual(["providerFoxer"]);
    expect(roleTypesMatching("performer")).toEqual(["providerFoxer"]);
  });

  it("matches nothing for ordinary or short terms", () => {
    expect(roleTypesMatching("john")).toEqual([]);
    expect(roleTypesMatching("in")).toEqual([]);
    expect(roleTypesMatching(undefined)).toEqual([]);
  });
});

describe("UsersRepo.buildDirectoryWhere", () => {
  it("also matches the role a search names", () => {
    const where = UsersRepo.buildDirectoryWhere(undefined, "investor");
    expect(where.OR).toEqual([
      { name: { contains: "investor", mode: "insensitive" } },
      { email: { contains: "investor", mode: "insensitive" } },
      { username: { contains: "investor", mode: "insensitive" } },
      { roleType: { hasSome: ["investor"] } },
    ]);
  });

  it("searches only name, email and username for other terms", () => {
    const where = UsersRepo.buildDirectoryWhere(undefined, "john");
    expect(where.OR).toHaveLength(3);
  });

  it("keeps the explicit roleType filter alongside the search", () => {
    const where = UsersRepo.buildDirectoryWhere(["eventFoxer"], "investor");
    expect(where.roleType).toEqual({ hasSome: ["eventFoxer"] });
    expect(where.OR).toHaveLength(4);
  });

  it("adds no clauses without a search or filter", () => {
    expect(UsersRepo.buildDirectoryWhere()).toEqual({});
  });
});

describe("UsersCtrl.getAllUsers roleType validation", () => {
  const call = async (query: Record<string, string>) => {
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    };
    await UsersCtrl.getAllUsers(
      { query } as unknown as Request,
      res as unknown as Response,
    );
    return res;
  };

  beforeEach(() => {
    svc.getAllUsers.mockReset();
    svc.getAllUsers.mockResolvedValue({ users: [], total: 0 });
  });

  it("refuses an unknown roleType with a 400", async () => {
    const res = await call({ roleType: "investor,bogus" });
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      message: "Unknown roleType: bogus",
    });
    expect(svc.getAllUsers).not.toHaveBeenCalled();
  });

  it("passes known roleTypes and the search through", async () => {
    const res = await call({ roleType: "investor", search: " ada " });
    expect(res.status).not.toHaveBeenCalled();
    expect(svc.getAllUsers).toHaveBeenCalledWith(["investor"], 1, 20, "ada");
  });
});
