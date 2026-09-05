import { RoleType, SystemRole } from "@prisma/client";
import { prisma } from "../../utils/prisma";
import { recordAudit } from "../audit/audit.service";
import { revokeAllForUser } from "../auth/refresh-token.service";

/**
 * Changing what a person *is*.
 *
 * This is the only write in the system that hands out capability directly, so
 * it is the one with the most rules around it. Three of them are worth stating
 * because each closes a specific way this goes wrong:
 *
 * **Nobody changes their own authorization state.** Not the system role, not
 * the role types. An administrator who needs a foxer role asks another
 * administrator, exactly as they would to be promoted. Without this an admin
 * can grant themselves `template:manage` and there is no second pair of eyes on
 * any privilege change.
 *
 * **The last administrator cannot be demoted.** Otherwise the console locks
 * everyone out permanently and the only way back is a hand-written UPDATE
 * against production.
 *
 * **Sessions are revoked on success.** Authorization is derived from the
 * verified token's claims, not from a database read, so a demoted admin keeps
 * admin until their access token expires. Revoking the refresh tokens bounds
 * that to the access-token lifetime and forces fresh claims. It is the same
 * mechanism a password change already uses.
 */

export class RoleAssignmentError extends Error {
  constructor(
    message: string,
    readonly reason: string,
    readonly status = 400,
  ) {
    super(message);
    this.name = "RoleAssignmentError";
  }
}

interface Actor {
  userId: string;
  email: string;
}

const SYSTEM_ROLES = new Set<string>(Object.values(SystemRole));
const ROLE_TYPES = new Set<string>(Object.values(RoleType));

async function loadTarget(id: string) {
  const target = await prisma.user.findUnique({
    where: { id },
    select: { id: true, email: true, systemRole: true, roleType: true },
  });
  if (!target) {
    throw new RoleAssignmentError("User not found", "target_missing", 404);
  }
  return target;
}

/** Records the refusal before throwing, so attempts are visible, not just changes. */
async function refuse(
  actor: Actor,
  action: string,
  targetId: string,
  targetEmail: string | null,
  reason: string,
  message: string,
  metadata: Record<string, unknown> = {},
  status = 400,
): Promise<never> {
  await recordAudit({
    actorId: actor.userId,
    actorEmail: actor.email,
    action,
    targetId,
    targetEmail,
    outcome: "refused",
    metadata: { reason, ...metadata },
  });
  throw new RoleAssignmentError(message, reason, status);
}

export default class RoleAssignmentSvc {
  static async changeSystemRole(
    actor: Actor,
    targetId: string,
    nextRole: string,
  ) {
    const action = "systemRole.change";

    if (!SYSTEM_ROLES.has(nextRole)) {
      await refuse(
        actor,
        action,
        targetId,
        null,
        "unknown_role",
        `"${nextRole}" is not a system role`,
        { attempted: nextRole },
      );
    }

    const target = await loadTarget(targetId);
    const previous = target.systemRole;

    if (target.id === actor.userId) {
      await refuse(
        actor,
        action,
        target.id,
        target.email,
        "self_change",
        "You cannot change your own system role",
        { previous, attempted: nextRole },
      );
    }

    if (previous === nextRole) {
      return { target, previous, changed: false as const };
    }

    // Only when demoting the last one — promoting never reduces the count.
    if (previous === SystemRole.admin) {
      const admins = await prisma.user.count({
        where: { systemRole: SystemRole.admin },
      });
      if (admins <= 1) {
        await refuse(
          actor,
          action,
          target.id,
          target.email,
          "last_admin",
          "This is the only administrator left — promote someone else first",
          { previous, attempted: nextRole },
        );
      }
    }

    const updated = await prisma.user.update({
      where: { id: target.id },
      data: { systemRole: nextRole as SystemRole },
      select: { id: true, email: true, systemRole: true, roleType: true },
    });

    const revoked = await revokeAllForUser(target.id);

    await recordAudit({
      actorId: actor.userId,
      actorEmail: actor.email,
      action,
      targetId: target.id,
      targetEmail: target.email,
      outcome: "allowed",
      metadata: { previous, next: nextRole, sessionsRevoked: revoked },
    });

    return { target: updated, previous, changed: true as const };
  }

  static async changeRoleTypes(
    actor: Actor,
    targetId: string,
    nextRoles: string[],
  ) {
    const action = "roleType.change";
    const unique = [...new Set(nextRoles)];

    const unknown = unique.filter((r) => !ROLE_TYPES.has(r));
    if (unknown.length > 0) {
      await refuse(
        actor,
        action,
        targetId,
        null,
        "unknown_role_type",
        `Not a role type: ${unknown.join(", ")}`,
        { attempted: unique },
      );
    }

    const target = await loadTarget(targetId);
    const previous = target.roleType;

    if (target.id === actor.userId) {
      await refuse(
        actor,
        action,
        target.id,
        target.email,
        "self_change",
        "You cannot change your own roles",
        { previous, attempted: unique },
      );
    }

    const updated = await prisma.user.update({
      where: { id: target.id },
      data: { roleType: unique as RoleType[] },
      select: { id: true, email: true, systemRole: true, roleType: true },
    });

    const revoked = await revokeAllForUser(target.id);

    await recordAudit({
      actorId: actor.userId,
      actorEmail: actor.email,
      action,
      targetId: target.id,
      targetEmail: target.email,
      outcome: "allowed",
      metadata: { previous, next: unique, sessionsRevoked: revoked },
    });

    return { target: updated, previous };
  }
}
