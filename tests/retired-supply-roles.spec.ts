import { describe, it, expect, vi, beforeEach } from "vitest";
import { RoleType } from "@prisma/client";

const findUserById = vi.fn();
const findPendingRequest = vi.fn();
const createRequest = vi.fn();

vi.mock("../src/utils/prisma", () => ({ prisma: {} }));
vi.mock("../src/modules/users/users.repository", () => ({
  default: { findUserById: (...a: unknown[]) => findUserById(...a) },
}));
vi.mock("../src/modules/role-request/role-request.repository", () => ({
  default: {
    findPendingRequest: (...a: unknown[]) => findPendingRequest(...a),
    createRequest: (...a: unknown[]) => createRequest(...a),
  },
}));
vi.mock("../src/modules/notifications/user-notification.service", () => ({
  default: {},
}));

import RoleRequestService, {
  RETIRED_APPLICATION_ROLES,
  retiredRoleError,
} from "../src/modules/role-request/role-request.service";
import { permissionsForUser } from "../src/types/permissions";
import { toRoleTypes, toUserPath } from "../src/utils/enums";

const RETIRED = ["gearFoxer", "serviceFoxer", "performerFoxer"];

/**
 * gearFoxer, serviceFoxer and performerFoxer were folded into providerFoxer
 * and removed from RoleType and UserPath (#228, #273). Every holder and
 * application was moved to providerFoxer by the
 * 20261109140000_move_legacy_supply_roles_to_provider migration.
 */
describe("retired supply roles", () => {
  beforeEach(() => {
    findUserById.mockReset();
    findPendingRequest.mockReset();
    createRequest.mockReset();
  });

  it("are gone from RoleType", () => {
    for (const r of RETIRED) {
      expect(Object.values(RoleType) as string[]).not.toContain(r);
    }
    expect(Object.values(RoleType)).toContain("providerFoxer");
    expect([...RETIRED_APPLICATION_ROLES].sort()).toEqual([...RETIRED].sort());
  });

  it.each(RETIRED)(
    "refuses a %s application with a pointer to providerFoxer",
    async (roleType) => {
      expect(retiredRoleError(roleType)).toMatch(/providerFoxer/);
      await expect(
        RoleRequestService.submitApplication(
          "user-1",
          roleType as RoleType,
          {},
        ),
      ).rejects.toThrow(/providerFoxer/);
      expect(findUserById).not.toHaveBeenCalled();
      expect(createRequest).not.toHaveBeenCalled();
    },
  );

  it.each([
    "providerFoxer",
    "venueFoxer",
    "eventFoxer",
    "organizer",
    "investor",
  ] as RoleType[])("still accepts %s applications", async (roleType) => {
    expect(retiredRoleError(roleType)).toBeNull();
    findUserById.mockResolvedValue({ id: "user-1", roleType: [] });
    findPendingRequest.mockResolvedValue(null);
    createRequest.mockResolvedValue({ id: "req-1" });

    await expect(
      RoleRequestService.submitApplication("user-1", roleType, {}),
    ).resolves.toEqual({ id: "req-1" });
  });

  it("ignores anything that is not a string", () => {
    expect(retiredRoleError(undefined)).toBeNull();
    expect(retiredRoleError(42)).toBeNull();
  });

  it("grant nothing if one is still on a stale session", () => {
    for (const r of RETIRED) {
      expect(permissionsForUser({ systemRole: "user", roleType: [r] })).toEqual(
        [],
      );
    }
  });

  it("map to providerFoxer as a filter, for older clients", () => {
    expect(toRoleTypes(["gearFoxer"])).toEqual(["providerFoxer"]);
    expect(toRoleTypes(["serviceFoxer", "performerFoxer"])).toEqual([
      "providerFoxer",
    ]);
    expect(toRoleTypes(["venueFoxer", "gearFoxer", "nonsense", 7])).toEqual([
      "venueFoxer",
      "providerFoxer",
    ]);
    expect(toRoleTypes([])).toEqual([]);
  });

  it("map to providerFoxer as an XP path, for older clients", () => {
    for (const r of RETIRED) {
      expect(toUserPath(r, "user")).toBe("providerFoxer");
    }
    expect(toUserPath("venueFoxer", "user")).toBe("venueFoxer");
    expect(toUserPath("nonsense", "user")).toBe("user");
    expect(toUserPath(undefined, "user")).toBe("user");
  });
});
