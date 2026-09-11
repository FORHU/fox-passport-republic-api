import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * The namespaces added in §2c, and the writes that retire them.
 *
 * `booking.invalidation.spec.ts` pins this property for bookings and payments;
 * this is that file for everything §2c added - venues, assets, services, users,
 * event templates, follows and investments.
 *
 * The rule being pinned is the one in `cache-namespaces.ts`: **a write that
 * changes what a listing or a profile displays must retire its namespace.** The
 * lists below are the write surface of each repository. A write added later
 * that does not appear here should fail this file rather than serve somebody
 * the listing they have just edited.
 *
 * The one deliberate exception is pinned at the bottom.
 */

const redis = vi.hoisted(() => {
  const store = new Map<string, string>();
  return {
    store,
    client: {
      get: vi.fn(async (k: string) => store.get(k) ?? null),
      set: vi.fn(async (k: string, v: string) => {
        store.set(k, v);
        return "OK";
      }),
      incr: vi.fn(async (k: string) => {
        const next = Number(store.get(k) ?? "0") + 1;
        store.set(k, String(next));
        return next;
      }),
      del: vi.fn(async () => 1),
    },
  };
});

vi.mock("../src/utils/redis.util", () => ({
  default: { getClient: () => redis.client },
}));

/** Every `prisma.<model>.<method>()` resolves to an empty row. */
const db = vi.hoisted(() => {
  const model = () =>
    new Proxy({} as Record<string, unknown>, {
      get: (_t, method) =>
        vi.fn(async () =>
          method === "findMany"
            ? [{ id: "x1" }]
            : { id: "x1", count: 1, roleType: [] },
        ),
    });
  return new Proxy({} as Record<string, unknown>, {
    get: (_target, prop) => {
      if (prop === "$transaction") return vi.fn(async () => [{ id: "x1" }]);
      if (prop === "$queryRaw") return vi.fn(async () => []);
      return model();
    },
  });
});

vi.mock("../src/utils/prisma", () => ({ prisma: db }));

import VenueRepo from "../src/modules/venue/venue.repository";
import AssetRepo from "../src/modules/asset/asset.repository";
import ServiceRepo from "../src/modules/service/service.repository";
import UsersRepo from "../src/modules/users/users.repository";
import ProfileRepo from "../src/modules/profile/profile.repository";
import FollowRepo from "../src/modules/follow/follow.repository";
import EventTemplateRepo from "../src/modules/event-template/event-template.repository";
import InvestmentRepo from "../src/modules/investment/investment.repository";
import PassportRepo from "../src/modules/passport/passport.repository";
import AdminRepo from "../src/modules/admin/admin.repository";

function version(namespace: string) {
  return Number(redis.store.get(`cache:version:${namespace}`) ?? "0");
}

beforeEach(() => {
  redis.store.clear();
  vi.clearAllMocks();
});

type Write = [string, () => Promise<unknown>];

const suites: [string, string, Write[]][] = [
  [
    "VenueRepo",
    "venue",
    [
      ["createVenue", () => VenueRepo.createVenue({} as never)],
      ["updateVenue", () => VenueRepo.updateVenue("v1", {})],
      ["archiveVenue", () => VenueRepo.archiveVenue("v1")],
    ],
  ],
  [
    "UsersRepo",
    "user",
    [
      ["createUser", () => UsersRepo.createUser({} as never)],
      ["updateUser", () => UsersRepo.updateUser("u1", {})],
      ["addRoleType", () => UsersRepo.addRoleType("u1", "eventFoxer" as never)],
      ["deleteUser", () => UsersRepo.deleteUser("u1")],
    ],
  ],
  [
    "ProfileRepo",
    "user",
    [
      ["updateProfile", () => ProfileRepo.updateProfile("u1", {})],
      ["updatePasswordHash", () => ProfileRepo.updatePasswordHash("u1", "h")],
      ["deleteUser", () => ProfileRepo.deleteUser("u1")],
    ],
  ],
  [
    "FollowRepo",
    "follow",
    [
      ["create", () => FollowRepo.create("u1", "u2", "pending")],
      ["delete", () => FollowRepo.delete("u1", "u2")],
      ["accept", () => FollowRepo.accept("u1", "u2")],
    ],
  ],
  [
    "InvestmentRepo",
    "investment",
    [
      ["createInvestment", () => InvestmentRepo.createInvestment({} as never)],
      [
        "updateInvestment",
        () => InvestmentRepo.updateInvestment("i1", {} as never),
      ],
      ["deleteInvestment", () => InvestmentRepo.deleteInvestment("i1")],
    ],
  ],
  /**
   * Passport is the one where this property replaced something rather than
   * adding to it. Its invalidation used to be six `invalidateAll()` calls
   * scattered through the service, one per write, added by hand — the
   * arrangement §0 of the plan re-opened and rejected for bookings, because the
   * write somebody forgets is the one that matters. These five are the whole
   * write surface now.
   */
  [
    "PassportRepo",
    "passport",
    [
      ["upsertPassport", () => PassportRepo.upsertPassport("u1")],
      ["upsertUserBadge", () => PassportRepo.upsertUserBadge("p1", "b1")],
      [
        "upsertPath",
        () =>
          PassportRepo.upsertPath({
            passportId: "p1",
            path: "user" as never,
            level: 2,
            currentXP: 10,
            totalXP: 1010,
          }),
      ],
      ["pushPerks", () => PassportRepo.pushPerks("p1", ["vip_lounge"])],
      ["createStamp", () => PassportRepo.createStamp({} as never)],
    ],
  ],
];

for (const [repo, namespace, writes] of suites) {
  describe(`every ${repo} write retires "${namespace}"`, () => {
    it.each(writes)("%s bumps the version", async (_name, call) => {
      const before = version(namespace);

      await call();

      expect(version(namespace)).toBeGreaterThan(before);
    });
  });
}

/**
 * Assets, services and templates are listed separately because their write
 * methods take shapes the loop above cannot express uniformly.
 */
describe("AssetRepo and ServiceRepo writes retire their namespaces", () => {
  it("every AssetRepo write bumps asset", async () => {
    for (const call of [
      () => AssetRepo.createAsset({} as never),
      () => AssetRepo.updateAsset("a1", {} as never),
      () => AssetRepo.deleteAsset("a1"),
    ]) {
      redis.store.clear();
      await call();
      expect(version("asset")).toBeGreaterThan(0);
    }
  });

  it("every ServiceRepo write bumps service", async () => {
    for (const call of [
      () => ServiceRepo.createService({} as never),
      () => ServiceRepo.updateService("s1", {} as never),
      () => ServiceRepo.deleteService("s1"),
    ]) {
      redis.store.clear();
      await call();
      expect(version("service")).toBeGreaterThan(0);
    }
  });

  /**
   * Attaching an item is what changes the price a template quotes, because that
   * price is computed from the attached items rather than stored - so these
   * count as writes to the template just as much as editing its name does.
   */
  it("attaching and detaching items bumps event-template", async () => {
    for (const call of [
      () => EventTemplateRepo.createTemplate({} as never),
      () => EventTemplateRepo.updateTemplate("t1", {}),
      () => EventTemplateRepo.deleteTemplate("t1"),
      () => EventTemplateRepo.removeAsset("t1", "a1"),
      () => EventTemplateRepo.removeService("t1", "s1"),
      () => EventTemplateRepo.removeVenue("t1", "v1"),
    ]) {
      redis.store.clear();
      await call();
      expect(version("event-template")).toBeGreaterThan(0);
    }
  });
});

/**
 * The approvals are the writes somebody is actually sitting on a page waiting
 * for, and they live in `AdminRepo` rather than in the module that owns the
 * reads - which is the whole reason these namespaces are in
 * `utils/cache-namespaces.ts` rather than being a `const` in a service.
 */
describe("AdminRepo retires the namespace it approves into", () => {
  const approvals: [string, string, () => Promise<unknown>][] = [
    ["approveVenue", "venue", () => AdminRepo.approveVenue("v1")],
    [
      "setVenueStatus",
      "venue",
      () => AdminRepo.setVenueStatus("v1", "available" as never),
    ],
    ["approveAsset", "asset", () => AdminRepo.approveAsset("a1")],
    [
      "setAssetStatus",
      "asset",
      () => AdminRepo.setAssetStatus("a1", "available" as never),
    ],
    ["approveService", "service", () => AdminRepo.approveService("s1")],
    [
      "setServiceStatus",
      "service",
      () => AdminRepo.setServiceStatus("s1", "available" as never),
    ],
    [
      "publishEventTemplate",
      "event-template",
      () => AdminRepo.publishEventTemplate("t1"),
    ],
    [
      "rejectEventTemplate",
      "event-template",
      () => AdminRepo.rejectEventTemplate("t1", "no"),
    ],
    [
      "setTemplatePublic",
      "event-template",
      () => AdminRepo.setTemplatePublic("t1", true),
    ],
  ];

  it.each(approvals)("%s bumps %s", async (_name, namespace, call) => {
    const before = version(namespace);

    await call();

    expect(version(namespace)).toBeGreaterThan(before);
  });
});

/**
 * The exception, pinned so that it stays deliberate rather than becoming an
 * oversight somebody "fixes".
 *
 * `updateUserLoginStatus` runs on every sign-in and writes `updatedAt` and
 * nothing else. Retiring the user namespace from there would throw away every
 * cached foxer listing each time anybody logged in anywhere - a cache whose hit
 * rate falls as the site gets busier.
 */
describe("the one write that deliberately does not retire", () => {
  it("a sign-in does not cool the user listings", async () => {
    const AuthRepo = (await import("../src/modules/auth/auth.repository"))
      .default;
    const before = version("user");

    await AuthRepo.updateUserLoginStatus("u1");

    expect(version("user")).toBe(before);
  });
});
