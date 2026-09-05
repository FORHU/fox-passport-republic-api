import { prisma } from "../../utils/prisma";

/**
 * A durable record of security-sensitive changes.
 *
 * Two properties matter more than completeness:
 *
 * **Refusals are recorded.** A log of what succeeded tells you the history; a
 * log of what was *attempted* tells you when someone tried to promote
 * themselves and was stopped. The second is the one worth having.
 *
 * **Writing it never fails the request.** An audit row that cannot be written
 * must not turn a completed privilege change into a 500 — the change already
 * happened, and losing the response would leave the caller believing it did
 * not. This is the same trade `invalidate.ts` makes for socket emits, for the
 * same reason. A failure here is logged loudly instead.
 */

export type AuditOutcome = "allowed" | "refused";

export interface AuditEntry {
  actorId: string;
  actorEmail: string;
  /** A verb a reader can scan: "systemRole.change", "roleType.change". */
  action: string;
  targetId: string;
  targetEmail?: string | null;
  outcome: AuditOutcome;
  metadata?: Record<string, unknown>;
}

export async function recordAudit(entry: AuditEntry): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        actorId: entry.actorId,
        actorEmail: entry.actorEmail,
        action: entry.action,
        targetId: entry.targetId,
        targetEmail: entry.targetEmail ?? null,
        outcome: entry.outcome,
        metadata: (entry.metadata ?? undefined) as never,
      },
    });
  } catch (e) {
    // Loudly, because a silent audit gap is worse than a noisy one.
    console.error("AUDIT WRITE FAILED", JSON.stringify(entry), e);
  }
}
