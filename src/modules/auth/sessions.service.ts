import { prisma } from "../../utils/prisma";

/**
 * Sign a user out everywhere: delete every Better Auth session they hold.
 * Used after a password change and a role change, where an existing session
 * must not outlive the change. Returns how many sessions were ended.
 */
export async function revokeAllSessions(userId: string): Promise<number> {
  const { count } = await prisma.session.deleteMany({ where: { userId } });
  return count;
}
