/**
 * One-time copy of Google/Facebook links into Better Auth's `accounts` table.
 *
 * The custom sign-in kept social links in `oauth_accounts`. Better Auth looks
 * them up in `accounts` by (providerId, accountId), so a user whose link exists
 * only in the old table would be treated as a stranger by Better Auth's Google
 * or Facebook sign-in. See docs/BETTER-AUTH-CONSOLIDATION.md, Phase 1.
 *
 * Run before the web or mobile switch to Better Auth social sign-in.
 *
 * Usage:
 *   pnpm exec ts-node --files tools/copy-oauth-accounts-to-better-auth.ts [--dry-run]
 *
 * Safe to re-run: a link already present in `accounts` is skipped, never
 * overwritten. APPLE links have no Better Auth provider configured and are
 * reported, not copied.
 */

import { prisma } from "../src/utils/prisma";

const DRY_RUN = process.argv.includes("--dry-run");

const PROVIDER_IDS = { GOOGLE: "google", FACEBOOK: "facebook" } as const;

async function main() {
  const links = await prisma.oAuthAccount.findMany();
  let copied = 0;
  let alreadyThere = 0;
  const unsupported: string[] = [];

  for (const link of links) {
    const providerId =
      PROVIDER_IDS[link.provider as keyof typeof PROVIDER_IDS];
    if (!providerId) {
      unsupported.push(`${link.provider} ${link.providerAccountId}`);
      continue;
    }

    const existing = await prisma.account.findFirst({
      where: { providerId, accountId: link.providerAccountId },
    });
    if (existing) {
      alreadyThere++;
      continue;
    }

    if (!DRY_RUN) {
      await prisma.account.create({
        data: {
          userId: link.userId,
          providerId,
          accountId: link.providerAccountId,
        },
      });
    }
    copied++;
  }

  console.log(
    `${DRY_RUN ? "[dry run] " : ""}oauth_accounts: ${links.length} | ` +
      `${DRY_RUN ? "would copy" : "copied"}: ${copied} | ` +
      `already in accounts: ${alreadyThere} | not copied: ${unsupported.length}`,
  );
  for (const u of unsupported) console.log(`  not copied (no provider): ${u}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
