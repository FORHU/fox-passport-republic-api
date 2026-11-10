/**
 * One-off recompute of every passport path's level for the new level curve
 * (requirements/xp-and-coins.md, section 4.1).
 *
 * Levels are derived from `totalXP`, so switching the curve changes what they
 * should be. This writes the level and progress the new curve gives, and adds
 * any perk a level already reached should have unlocked. It does it silently:
 * it never calls `RewardService.grant`, `PassportSvc.awardXP` or anything that
 * pays Coins or raises a reward sheet, so nobody gets a level-up bonus for a
 * level reached only by the recalculation. It never lowers a level and never
 * removes a perk, and it does not award badges.
 *
 * Usage:
 *   pnpm exec tsx tools/recompute-levels.ts            (dry run: writes nothing)
 *   pnpm exec tsx tools/recompute-levels.ts --apply    (writes)
 *
 * Unlike the other tools it writes only with `--apply`, because a mistake here
 * changes every user. Safe to re-run: a path already on the new curve is
 * skipped. Writes go through `PassportRepo`, which retires the passport cache.
 */

import { prisma } from "../src/utils/prisma";
import PassportRepo from "../src/modules/passport/passport.repository";
import { planPathRecompute } from "../src/modules/passport/level-recompute";

const APPLY = process.argv.includes("--apply");
const BATCH = 500;

function bump(map: Map<number, number>, level: number) {
  map.set(level, (map.get(level) ?? 0) + 1);
}

function printDistribution(
  before: Map<number, number>,
  after: Map<number, number>,
) {
  const levels = [...new Set([...before.keys(), ...after.keys()])].sort(
    (a, b) => a - b,
  );
  console.log("\nPaths per level (before -> after):");
  for (const l of levels) {
    console.log(
      `  level ${String(l).padStart(3)}: ${String(before.get(l) ?? 0).padStart(6)} -> ${String(after.get(l) ?? 0).padStart(6)}`,
    );
  }
}

async function main() {
  console.log(APPLY ? "APPLY: writing changes" : "DRY RUN: nothing is written");

  const before = new Map<number, number>();
  const after = new Map<number, number>();
  let examined = 0;
  let changed = 0;
  let perksToGrant = 0;
  let failed = 0;
  let cursor: string | undefined;
  // Perks already pushed in this run, per passport: two paths of one passport
  // can share a perk (lower_fees is on both gear and provider).
  const pushed = new Map<string, string[]>();

  for (;;) {
    const rows = await prisma.passportPath.findMany({
      take: BATCH,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: { id: "asc" },
      include: { passport: { select: { id: true, perks: true } } },
    });
    if (rows.length === 0) break;
    cursor = rows[rows.length - 1].id;

    for (const row of rows) {
      examined++;
      bump(before, row.level);
      const plan = planPathRecompute({
        path: row.path,
        totalXP: row.totalXP,
        level: row.level,
        currentXP: row.currentXP,
        perks: [...row.passport.perks, ...(pushed.get(row.passport.id) ?? [])],
      });
      bump(after, plan.level);

      if (!plan.changed && plan.missingPerks.length === 0) continue;
      if (plan.changed) changed++;
      perksToGrant += plan.missingPerks.length;
      pushed.set(row.passport.id, [
        ...(pushed.get(row.passport.id) ?? []),
        ...plan.missingPerks,
      ]);
      if (!APPLY) continue;

      try {
        if (plan.changed) {
          await PassportRepo.upsertPath({
            passportId: row.passportId,
            path: row.path,
            level: plan.level,
            currentXP: plan.currentXP,
            totalXP: row.totalXP,
          });
        }
        if (plan.missingPerks.length > 0) {
          await PassportRepo.pushPerks(row.passport.id, plan.missingPerks);
        }
      } catch (e) {
        failed++;
        console.error(`failed for path ${row.id}:`, e);
      }
    }
  }

  printDistribution(before, after);
  console.log(
    `\n${examined} paths examined, ${changed} level changes, ${perksToGrant} perks to grant, ${failed} failed.`,
  );
  if (!APPLY) console.log("Re-run with --apply to write.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
