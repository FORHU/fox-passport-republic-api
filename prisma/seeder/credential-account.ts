import type { PrismaClient } from "@prisma/client";

/**
 * What Better Auth's email sign-in reads. `POST /auth/sign-in/email` looks up
 * the user, then the `credential` Account row that holds the password hash; a
 * hash on `User.password` alone is invisible to it, so a seeded user without
 * this row cannot sign in at all.
 *
 * Every seeder that creates a user must call this, and mark the user's email
 * verified (login refuses anyone who isn't). `tests/seed-credential-accounts.
 * spec.ts` fails when a seeder creates users without it.
 */
export async function ensureCredentialAccount(
  prisma: {
    account: Pick<PrismaClient["account"], "findFirst" | "update" | "create">;
  },
  userId: string,
  hashedPassword: string,
): Promise<void> {
  const existing = await prisma.account.findFirst({
    where: { userId, providerId: "credential" },
  });

  if (existing) {
    await prisma.account.update({
      where: { id: existing.id },
      data: { password: hashedPassword },
    });
    return;
  }

  await prisma.account.create({
    data: {
      userId,
      accountId: userId,
      providerId: "credential",
      password: hashedPassword,
    },
  });
}
