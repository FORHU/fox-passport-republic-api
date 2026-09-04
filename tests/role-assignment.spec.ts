import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Role assignment is the only write that hands out capability directly, so the
 * rules around it are the point rather than the mechanics. Each of these covers
 * a specific way it goes wrong: an admin quietly promoting themselves, the last
 * administrator being demoted and locking everyone out, an invalid role reaching
 * an enum that has never heard of it, and a privilege change leaving no trace.
 */

const db = vi.hoisted(() => ({
  users: [] as {
    id: string;
    email: string;
    systemRole: string;
    roleType: string[];
  }[],
  audits: [] as Record<string, unknown>[],
  revoked: [] as string[],
}));

vi.mock("../src/utils/prisma", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) =>
        db.users.find((u) => u.id === where.id) ?? null,
      ),
      count: vi.fn(async ({ where }: { where: { systemRole: string } }) =>
        db.users.filter((u) => u.systemRole === where.systemRole).length,
      ),
      update: vi.fn(
        async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
          const u = db.users.find((x) => x.id === where.id)!;
          Object.assign(u, data);
          return u;
        },
      ),
    },
    auditLog: { create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => { db.audits.push(data); return data; }) },
  },
}));

vi.mock("../src/modules/auth/refresh-token.service", () => ({
  revokeAllForUser: vi.fn(async (id: string) => { db.revoked.push(id); return 2; }),
}));

import RoleAssignmentSvc, {
  RoleAssignmentError,
} from "../src/modules/admin/role-assignment.service";

const admin = { userId: "admin-1", email: "admin@example.com" };

beforeEach(() => {
  db.users = [
    { id: "admin-1", email: "admin@example.com", systemRole: "admin", roleType: [] },
    { id: "admin-2", email: "admin2@example.com", systemRole: "admin", roleType: [] },
    { id: "user-1", email: "user@example.com", systemRole: "user", roleType: [] },
  ];
  db.audits = [];
  db.revoked = [];
});

const lastAudit = () => db.audits[db.audits.length - 1];

describe("changing a system role", () => {
  it("promotes, revokes the target's sessions, and records it", async () => {
    const r = await RoleAssignmentSvc.changeSystemRole(admin, "user-1", "admin_secretary");

    expect(r.target.systemRole).toBe("admin_secretary");
    expect(r.previous).toBe("user");
    // Authorization comes from the token's claims, so without this the new role
    // does not take effect until the old access token expires.
    expect(db.revoked).toContain("user-1");
    expect(lastAudit()).toMatchObject({
      action: "systemRole.change",
      outcome: "allowed",
      actorId: "admin-1",
      targetId: "user-1",
    });
  });

  it("refuses to let an admin change their own role, and records the attempt", async () => {
    await expect(
      RoleAssignmentSvc.changeSystemRole(admin, "admin-1", "user"),
    ).rejects.toThrow(RoleAssignmentError);

    expect(lastAudit()).toMatchObject({ outcome: "refused" });
    expect(lastAudit().metadata).toMatchObject({ reason: "self_change" });
    expect(db.users.find((u) => u.id === "admin-1")!.systemRole).toBe("admin");
  });

  it("refuses to demote the last administrator", async () => {
    db.users = db.users.filter((u) => u.id !== "admin-2");

    await expect(
      RoleAssignmentSvc.changeSystemRole(
        { userId: "someone-else", email: "other@example.com" },
        "admin-1",
        "user",
      ),
    ).rejects.toThrow(/only administrator/i);

    expect(lastAudit().metadata).toMatchObject({ reason: "last_admin" });
  });

  it("demotes an admin while another remains", async () => {
    const r = await RoleAssignmentSvc.changeSystemRole(admin, "admin-2", "user");
    expect(r.target.systemRole).toBe("user");
  });

  it("rejects a role the schema has never heard of", async () => {
    await expect(
      RoleAssignmentSvc.changeSystemRole(admin, "user-1", "super_admin"),
    ).rejects.toThrow(/not a system role/i);
    expect(lastAudit().metadata).toMatchObject({ reason: "unknown_role" });
  });

  it("is a no-op when the role already matches", async () => {
    const r = await RoleAssignmentSvc.changeSystemRole(admin, "admin-2", "admin");
    expect(r.changed).toBe(false);
    expect(db.revoked).toHaveLength(0);
  });
});

describe("changing role types", () => {
  it("sets them, de-duplicates, revokes sessions and records it", async () => {
    const r = await RoleAssignmentSvc.changeRoleTypes(admin, "user-1", [
      "venueFoxer",
      "venueFoxer",
      "eventFoxer",
    ]);

    expect(r.target.roleType).toEqual(["venueFoxer", "eventFoxer"]);
    expect(db.revoked).toContain("user-1");
    expect(lastAudit()).toMatchObject({ action: "roleType.change", outcome: "allowed" });
  });

  it("refuses self-assignment — granting yourself template:manage is escalation", async () => {
    await expect(
      RoleAssignmentSvc.changeRoleTypes(admin, "admin-1", ["eventFoxer"]),
    ).rejects.toThrow(/your own roles/i);
    expect(lastAudit().metadata).toMatchObject({ reason: "self_change" });
  });

  it("rejects an unknown role type", async () => {
    await expect(
      RoleAssignmentSvc.changeRoleTypes(admin, "user-1", ["venueFoxer", "wizard"]),
    ).rejects.toThrow(/not a role type/i);
    expect(lastAudit().metadata).toMatchObject({ reason: "unknown_role_type" });
  });
});
