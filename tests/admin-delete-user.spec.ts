import { describe, it, expect, vi, beforeEach } from "vitest";
import jwt from "jsonwebtoken";
import request from "supertest";
import { ACCESS_TOKEN_SECRET } from "../src/config";
import { AppError } from "../src/utils/errors";

const db = vi.hoisted(() => ({
  users: [] as {
    id: string;
    email: string;
    name: string;
    username: string;
    systemRole: string;
    roleType: string[];
  }[],
  audits: [] as Record<string, unknown>[],
  revoked: [] as string[],
  endedAppointments: [] as string[],
}));

vi.mock("../src/utils/prisma", () => ({
  connectToPrisma: vi.fn(async () => {}),
  prisma: {
    $transaction: vi.fn(async (ops: unknown[]) => {
      if (Array.isArray(ops)) {
        return Promise.all(ops);
      }
      return ops;
    }),
    user: {
      findUnique: vi.fn(
        async ({ where }: { where: { id: string } }) =>
          db.users.find((u) => u.id === where.id) ?? null,
      ),
      count: vi.fn(
        async ({ where }: { where: { systemRole: string } }) =>
          db.users.filter((u) => u.systemRole === where.systemRole).length,
      ),
      delete: vi.fn(
        async ({ where }: { where: { id: string } }) => {
          const idx = db.users.findIndex((u) => u.id === where.id);
          if (idx !== -1) {
            const [removed] = db.users.splice(idx, 1);
            return removed;
          }
          return null;
        },
      ),
    },
    roleRequest: { updateMany: vi.fn(async () => ({ count: 0 })) },
    identityVerification: { updateMany: vi.fn(async () => ({ count: 0 })) },
    report: { updateMany: vi.fn(async () => ({ count: 0 })) },
    venueEventFoxerAffiliation: { updateMany: vi.fn(async () => ({ count: 0 })) },
    appointment: { updateMany: vi.fn(async () => ({ count: 0 })) },
    bookingAttendee: { updateMany: vi.fn(async () => ({ count: 0 })) },
    file: { updateMany: vi.fn(async () => ({ count: 0 })) },
    bookingEditRequest: {
      updateMany: vi.fn(async () => ({ count: 0 })),
      deleteMany: vi.fn(async () => ({ count: 0 })),
    },
    eventServiceBid: { deleteMany: vi.fn(async () => ({ count: 0 })) },
    eventAssetBid: { deleteMany: vi.fn(async () => ({ count: 0 })) },
    auditLog: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        db.audits.push(data);
        return data;
      }),
    },
  },
}));

vi.mock("../src/modules/auth/refresh-token.service", () => ({
  revokeAllForUser: vi.fn(async (id: string) => {
    db.revoked.push(id);
    return 2;
  }),
}));

vi.mock("../src/modules/appointment/appointment.service", () => ({
  default: {
    endForRevokedOrganizer: vi.fn(async (userId: string) => {
      db.endedAppointments.push(`organizer:${userId}`);
    }),
    endForRevokedOwner: vi.fn(async (userId: string) => {
      db.endedAppointments.push(`owner:${userId}`);
    }),
  },
}));

import AdminSvc from "../src/modules/admin/admin.service";
import apiApp from "../src/app";

const admin = { userId: "admin-1", email: "admin@example.com" };

function tokenFor(user: { id: string; email: string; systemRole: string }) {
  return jwt.sign(
    {
      userId: user.id,
      email: user.email,
      systemRole: user.systemRole,
      roleType: [],
    },
    ACCESS_TOKEN_SECRET,
  );
}

beforeEach(() => {
  db.users = [
    {
      id: "admin-1",
      email: "admin@example.com",
      name: "Admin One",
      username: "admin1",
      systemRole: "admin",
      roleType: [],
    },
    {
      id: "admin-2",
      email: "admin2@example.com",
      name: "Admin Two",
      username: "admin2",
      systemRole: "admin",
      roleType: [],
    },
    {
      id: "user-1",
      email: "user@example.com",
      name: "Standard User",
      username: "user1",
      systemRole: "user",
      roleType: ["organizer", "venueFoxer"],
    },
  ];
  db.audits = [];
  db.revoked = [];
  db.endedAppointments = [];
});

const lastAudit = () => db.audits[db.audits.length - 1];

describe("Admin delete user service", () => {
  it("deletes a user, revokes sessions, ends appointments, and records audit", async () => {
    const result = await AdminSvc.deleteUser(admin, "user-1", "Violated terms of service");

    expect(result).toEqual({ id: "user-1", email: "user@example.com" });
    expect(db.users.find((u) => u.id === "user-1")).toBeUndefined();
    expect(db.revoked).toContain("user-1");
    expect(db.endedAppointments).toContain("organizer:user-1");
    expect(db.endedAppointments).toContain("owner:user-1");
    expect(lastAudit()).toMatchObject({
      action: "user.delete",
      outcome: "allowed",
      actorId: "admin-1",
      actorEmail: "admin@example.com",
      targetId: "user-1",
      targetEmail: "user@example.com",
      metadata: expect.objectContaining({
        systemRole: "user",
        sessionsRevoked: 2,
        reason: "Violated terms of service",
      }),
    });
  });

  it("refuses self-deletion via admin management and records the refused audit", async () => {
    await expect(AdminSvc.deleteUser(admin, "admin-1")).rejects.toThrow(
      "You cannot delete your own account via admin user management",
    );

    expect(db.users.find((u) => u.id === "admin-1")).toBeDefined();
    expect(lastAudit()).toMatchObject({
      action: "user.delete",
      outcome: "refused",
      actorId: "admin-1",
      targetId: "admin-1",
      metadata: { reason: "self_delete" },
    });
  });

  it("refuses to delete the last administrator", async () => {
    db.users = db.users.filter((u) => u.id !== "admin-1");

    await expect(
      AdminSvc.deleteUser(
        { userId: "another-admin", email: "another@example.com" },
        "admin-2",
      ),
    ).rejects.toThrow(/only administrator/i);

    expect(db.users.find((u) => u.id === "admin-2")).toBeDefined();
    expect(lastAudit()).toMatchObject({
      action: "user.delete",
      outcome: "refused",
      metadata: { reason: "last_admin" },
    });
  });

  it("throws 404 when target is not found", async () => {
    await expect(AdminSvc.deleteUser(admin, "nonexistent-id")).rejects.toThrow(AppError);
  });
});

describe("Admin delete user HTTP endpoint", () => {
  it("DELETE /api/v1/admin/users/:id deletes user when requested by admin", async () => {
    const adminUser = db.users[0];
    const res = await request(apiApp)
      .delete("/api/v1/admin/users/user-1")
      .set("Authorization", `Bearer ${tokenFor(adminUser)}`)
      .send({ reason: "Admin requested deletion" });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toBe("User account deleted successfully");
    expect(res.body.data).toEqual({ id: "user-1", email: "user@example.com" });
  });

  it("DELETE /api/v1/admin/users/:id rejects unauthenticated request with 401", async () => {
    const res = await request(apiApp).delete("/api/v1/admin/users/user-1");
    expect(res.status).toBe(401);
  });

  it("DELETE /api/v1/admin/users/:id rejects citizen with 403", async () => {
    const citizen = db.users[2];
    const res = await request(apiApp)
      .delete("/api/v1/admin/users/user-1")
      .set("Authorization", `Bearer ${tokenFor(citizen)}`);
    expect(res.status).toBe(403);
  });

  it("DELETE /api/v1/admin/users/:id rejects admin_secretary with 403", async () => {
    const secToken = jwt.sign(
      {
        userId: "sec-1",
        email: "sec@example.com",
        systemRole: "admin_secretary",
        roleType: [],
      },
      ACCESS_TOKEN_SECRET,
    );
    const res = await request(apiApp)
      .delete("/api/v1/admin/users/user-1")
      .set("Authorization", `Bearer ${secToken}`);
    expect(res.status).toBe(403);
  });
});
