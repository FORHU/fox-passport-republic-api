import { describe, it, expect } from "vitest";
import { SystemRole } from "@prisma/client";
import {
  can,
  permissionsFor,
  permissionsForUser,
  PERMISSIONS,
} from "../src/types/permissions";

/**
 * `EventRequestSvc.approveRequest` re-checks `queue:read` (with an
 * organizer-ownership override), not `queue:decide`, even though the
 * `/admin/events/:id/approve` route gates on `queue:decide` — see
 * docs/adr/0004-source-tree-by-domain.md. That is only safe because every
 * role holding `queue:decide` also holds `queue:read`. This test is what
 * makes that an enforced invariant instead of an incidental one: a role
 * granted `queue:decide` without `queue:read` would let it clear the route
 * but fail inside the service.
 */
describe("queue:decide implies queue:read", () => {
  it.each(Object.values(SystemRole))("holds both, or neither, for %s", (role) => {
    if (can(role, "queue:decide")) {
      expect(can(role, "queue:read")).toBe(true);
    }
  });
});

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

/**
 * The supply-side capabilities belong to `RoleType`, not to `SystemRole`, and
 * an admin does not hold them. That is not an oversight to tidy up later: an
 * admin cannot create a venue or an event template today, and converting a
 * role-name guard into a permission must not quietly widen that.
 *
 * `booking:check-in` is the single exception, because the guard it replaces —
 * `requireHost` — was `["eventFoxer", "admin"]`.
 */
const SUPPLY_ONLY = [
  "venue:manage",
  "asset:manage",
  "service:manage",
  "template:manage",
  "payouts:onboard",
] as const;

const ADMIN_HOLDS = PERMISSIONS.filter(
  (p) => !(SUPPLY_ONLY as readonly string[]).includes(p),
);

describe("admin", () => {
  it.each(ADMIN_HOLDS)("holds %s", (permission) => {
    expect(can("admin", permission)).toBe(true);
  });

  it.each(SUPPLY_ONLY)("does not hold %s", (permission) => {
    expect(can("admin", permission)).toBe(false);
  });

  it("holds booking:check-in, because requireHost included admin", () => {
    expect(can("admin", "booking:check-in")).toBe(true);
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
      expect(can(role as string | null | undefined, "admin:access")).toBe(
        false,
      );
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
    const before = permissionsFor("admin").length;
    const first = permissionsFor("admin");
    first.pop();
    expect(permissionsFor("admin")).toHaveLength(before);
  });

  it("is SystemRole-only — it never answers with a supply permission", () => {
    for (const p of SUPPLY_ONLY) {
      expect(permissionsFor("admin")).not.toContain(p);
    }
  });
});

/**
 * The supply axis. `RoleType` authorised 25 routes through `requireRole` while
 * everything else went through a permission — two mechanisms answering the same
 * question. These pin the properties that let it become one without widening
 * anything.
 */
describe("the supply side", () => {
  const host = { systemRole: "user", roleType: ["eventFoxer"] };
  const mayor = { systemRole: "user", roleType: ["venueFoxer"] };

  it("grants each foxer type its own capability", () => {
    expect(can(host, "template:manage")).toBe(true);
    expect(can(mayor, "venue:manage")).toBe(true);
    expect(can({ roleType: ["gearFoxer"] }, "asset:manage")).toBe(true);
    expect(can({ roleType: ["serviceFoxer"] }, "service:manage")).toBe(true);
  });

  it("does not leak one foxer's capability to another", () => {
    expect(can(mayor, "template:manage")).toBe(false);
    expect(can(host, "venue:manage")).toBe(false);
  });

  it("gives every foxer type payouts:onboard, and investor nothing", () => {
    for (const r of ["venueFoxer", "eventFoxer", "gearFoxer", "serviceFoxer"]) {
      expect(can({ roleType: [r] }, "payouts:onboard")).toBe(true);
    }
    expect(can({ roleType: ["investor"] }, "payouts:onboard")).toBe(false);
    expect(permissionsForUser({ roleType: ["investor"] })).toEqual([]);
  });

  it("holds a multi-role user's union", () => {
    const multi = {
      systemRole: "user",
      roleType: ["eventFoxer", "venueFoxer"],
    };
    expect(can(multi, "template:manage")).toBe(true);
    expect(can(multi, "venue:manage")).toBe(true);
    expect(can(multi, "asset:manage")).toBe(false);
  });
});

describe("a bare string is SystemRole-only", () => {
  // The mechanism that keeps `admin` out of the supply side. If a role name
  // ever consults ROLE_TYPE_GRANTS, every admin silently gains every foxer
  // capability — the privilege widening this conversion exists to avoid.
  it.each([
    "venue:manage",
    "asset:manage",
    "service:manage",
    "template:manage",
  ] as const)('can("admin", "%s") stays false', (permission) => {
    expect(can("admin", permission)).toBe(false);
  });

  it("but a complete subject carrying the role type is answered", () => {
    expect(
      can({ systemRole: "admin", roleType: ["eventFoxer"] }, "template:manage"),
    ).toBe(true);
  });
});

describe("unknown role types fail closed", () => {
  it("denies a roleType the schema has never heard of", () => {
    expect(
      can(
        { systemRole: "user", roleType: ["notARealRole"] },
        "template:manage",
      ),
    ).toBe(false);
    expect(permissionsForUser({ roleType: ["notARealRole"] })).toEqual([]);
  });

  it("denies an empty or absent subject", () => {
    expect(can({}, "venue:manage")).toBe(false);
    expect(can({ roleType: [] }, "venue:manage")).toBe(false);
  });
});

describe("permissionsForUser", () => {
  it("merges both axes without duplicating the overlap", () => {
    // `booking:check-in` is granted by both `admin` and `eventFoxer`.
    const both = { systemRole: "admin", roleType: ["eventFoxer"] };
    const resolved = permissionsForUser(both);
    expect(resolved.filter((p) => p === "booking:check-in")).toHaveLength(1);
    expect(resolved).toContain("refunds:manage");
    expect(resolved).toContain("template:manage");
  });

  it("agrees with permissionsFor when there is no supply role", () => {
    expect(
      permissionsForUser({ systemRole: "admin_secretary" }).sort(),
    ).toEqual(permissionsFor("admin_secretary").sort());
  });
});
