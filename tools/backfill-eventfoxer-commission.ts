/**
 * One-time backfill for the per-EventFoxer commission rate (#264).
 *
 * Commission used to be `EventTemplate.hostMarkupPct`, set separately on each
 * template. It is now one rate per EventFoxer, `User.commissionPct`, applied to
 * every Event they created. The migration that added the column starts everyone
 * at 0, which would silently drop every existing EventFoxer's markup; this sets
 * each one's starting rate from what they already charge.
 *
 * The rule, when an EventFoxer's templates disagree: the value used by the most
 * templates; on a tie, the value of the most recently updated of the tied
 * templates. Decided 2026-11-06 (Q14 in the library plan).
 *
 * Only users who hold the `eventFoxer` role and still have `commissionPct = 0`
 * are written. Anyone who already has a non-zero rate set it themselves (or an
 * earlier run did), so it is never overwritten. An EventFoxer with no templates,
 * or whose templates all have 0, is left at 0.
 *
 * Usage:
 *   pnpm exec ts-node --files tools/backfill-eventfoxer-commission.ts [--dry-run]
 *
 * --dry-run prints what would be set without writing anything. Safe to re-run:
 * a user whose rate is already non-zero is skipped.
 */

import { prisma } from "../src/utils/prisma";
import { Prisma } from "@prisma/client";

const DRY_RUN = process.argv.includes("--dry-run");

export interface TemplateRate {
  hostMarkupPct: number;
  updatedAt: Date;
}

/**
 * The starting rate for one EventFoxer, in percent with 2 decimals, or null
 * when they have no templates. Pure, so it is testable without a database.
 *
 * Values are rounded to 2 decimals before they are counted, so 10 and 10.001
 * count as the same rate, and clamped to 0–100, the range commission allows.
 */
export function pickStartingRate(templates: TemplateRate[]): number | null {
  if (templates.length === 0) return null;

  const byRate = new Map<number, { count: number; latest: number }>();
  for (const t of templates) {
    const raw = Number.isFinite(t.hostMarkupPct) ? t.hostMarkupPct : 0;
    const rate = Math.round(Math.min(100, Math.max(0, raw)) * 100) / 100;
    const seen = byRate.get(rate);
    const at = t.updatedAt.getTime();
    if (seen) {
      seen.count++;
      seen.latest = Math.max(seen.latest, at);
    } else {
      byRate.set(rate, { count: 1, latest: at });
    }
  }

  let best: { rate: number; count: number; latest: number } | null = null;
  for (const [rate, { count, latest }] of byRate) {
    if (
      !best ||
      count > best.count ||
      (count === best.count && latest > best.latest)
    ) {
      best = { rate, count, latest };
    }
  }
  return best ? best.rate : null;
}

interface Report {
  eventFoxers: number;
  set: { userId: string; rate: number; templates: number; distinct: number }[];
  skippedAlreadySet: number;
  skippedNoTemplates: number;
  skippedZero: number;
  failed: { userId: string; error: string }[];
}

async function main() {
  const report: Report = {
    eventFoxers: 0,
    set: [],
    skippedAlreadySet: 0,
    skippedNoTemplates: 0,
    skippedZero: 0,
    failed: [],
  };

  const users = await prisma.user.findMany({
    where: { roleType: { has: "eventFoxer" } },
    select: {
      id: true,
      commissionPct: true,
      eventTemplates: { select: { hostMarkupPct: true, updatedAt: true } },
    },
  });
  report.eventFoxers = users.length;

  for (const user of users) {
    if (!user.commissionPct.isZero()) {
      report.skippedAlreadySet++;
      continue;
    }
    const rate = pickStartingRate(user.eventTemplates);
    if (rate === null) {
      report.skippedNoTemplates++;
      continue;
    }
    if (rate === 0) {
      report.skippedZero++;
      continue;
    }

    const entry = {
      userId: user.id,
      rate,
      templates: user.eventTemplates.length,
      distinct: new Set(user.eventTemplates.map((t) => t.hostMarkupPct)).size,
    };

    if (DRY_RUN) {
      report.set.push(entry);
      continue;
    }

    try {
      // Conditional on the rate still being 0, so a rate the EventFoxer set
      // between the read above and this write is not overwritten.
      const { count } = await prisma.user.updateMany({
        where: { id: user.id, commissionPct: 0 },
        data: { commissionPct: new Prisma.Decimal(rate) },
      });
      if (count === 1) report.set.push(entry);
      else report.skippedAlreadySet++;
    } catch (err) {
      report.failed.push({ userId: user.id, error: (err as Error).message });
    }
  }

  printReport(report);
}

function printReport(report: Report) {
  console.log(
    `\nbackfill-eventfoxer-commission${DRY_RUN ? " (dry run, nothing written)" : ""}`,
  );
  console.log(`  EventFoxers examined:        ${report.eventFoxers}`);
  console.log(
    `  ${DRY_RUN ? "Would set" : "Set"}:                   ${report.set.length}`,
  );
  console.log(`  Skipped, rate already set:   ${report.skippedAlreadySet}`);
  console.log(`  Skipped, no templates:       ${report.skippedNoTemplates}`);
  console.log(`  Skipped, templates all at 0: ${report.skippedZero}`);
  console.log(`  Failed:                      ${report.failed.length}`);

  for (const s of report.set) {
    const note =
      s.distinct > 1 ? ` (templates disagreed: ${s.distinct} rates)` : "";
    console.log(
      `  - user=${s.userId} rate=${s.rate}% from ${s.templates} template(s)${note}`,
    );
  }
  for (const f of report.failed) {
    console.log(`  ! user=${f.userId} error="${f.error}"`);
  }
}

if (typeof require !== "undefined" && require.main === module) {
  main()
    .catch((err) => {
      console.error("backfill-eventfoxer-commission failed:", err);
      process.exitCode = 1;
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
