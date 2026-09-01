import { describe, it, expect } from "vitest";
import { can, permissionsFor, PERMISSIONS } from "../src/types/permissions";

/**
 * `admin_secretary` exists to work the approval queues without seeing who
 * anyone is. That distinction is the whole reason the role was added, so it is
 * pinned here rather than left to whoever next edits the grant table.
 */

describe("admin_secretary", () => {
  it("can read and decide on the approval queues", () => {
    expect(can("admin_secretary", "queue:read")).toBe(true);
    expect(can("admin_secretary", "queue:decide")).toBe(true);
  });

  it("can reach the admin console", () => {
    expect(can("admin_secretary", "admin:access")).toBe(true);
  });

  it("cannot see who anyone is", () => {
    expect(can("admin_secretary", "users:read")).toBe(false);
    expect(can("admin_secretary", "bookings:read:all")).toBe(false);
  });

  it("cannot change what anyone is", () => {
    expect(can("admin_secretary", "roles:manage")).toBe(false);
  });

  it("cannot manage categories", () => {
    expect(can("admin_secretary", "categories:manage")).toBe(false);
  });
});

describe("admin", () => {
  it.each(PERMISSIONS)("holds %s", (permission) => {
    expect(can("admin", permission)).toBe(true);
  });
});

describe("user", () => {
  it.each(PERMISSIONS)("holds no %s", (permission) => {
    expect(can("user", permission)).toBe(false);
  });
});

describe("unknown and missing roles", () => {
  // The old narrowing turned anything unrecognised into "user"; this asserts
  // the replacement denies rather than defaults.
  it.each([undefined, null, "", "super_admin", "moderator", "ADMIN"])(
    "denies %s",
    (role) => {
      expect(can(role as string | null | undefined, "queue:read")).toBe(false);
      expect(can(role as string | null | undefined, "admin:access")).toBe(false);
    },
  );
});

describe("permissionsFor", () => {
  it("gives the secretary exactly three capabilities", () => {
    expect(permissionsFor("admin_secretary").sort()).toEqual(
      ["admin:access", "queue:decide", "queue:read"].sort(),
    );
  });

  it("gives an unknown role nothing", () => {
    expect(permissionsFor("moderator")).toEqual([]);
  });

  it("returns a copy, so a caller cannot edit the grant table", () => {
    const first = permissionsFor("admin");
    first.pop();
    expect(permissionsFor("admin")).toHaveLength(PERMISSIONS.length);
  });
});
