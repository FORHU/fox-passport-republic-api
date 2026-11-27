/**
 * One-time backfill: saved phone numbers rewritten as E.164 (api#492).
 *
 * Before the E.164 fix (2026-10-28, #147) a number was saved the way it was
 * typed, so one number could be stored as `09171234567`, `9171234567` or
 * `+639171234567`. This rewrites each of them as E.164 with the rule new
 * writes use (utils/phone normalizePhone):
 *
 * - `VenueFoxerApplication.contactNumber`: a number without its `+code` is
 *   read in the application's `tinCountry`, else as Philippine.
 * - `UserProfile.phone` and the legacy `User.phone` (the profile falls back
 *   to it): read as Philippine, like PUT /profile.
 *
 * It does not apply the newer mobile-only rule for Philippine contact numbers:
 * a landline saved before that rule is a real number someone gave, so it is
 * normalized and kept, not dropped.
 *
 * Rows already in E.164 are skipped, so it is safe to re-run. A number that
 * doesn't parse is never changed; it is listed under "needs manual review".
 *
 * Usage:
 *   pnpm exec ts-node --files tools/backfill-contact-numbers.ts [--dry-run]
 *
 * --dry-run reports what would change without writing anything.
 */

import { prisma } from "../src/utils/prisma";
import { normalizePhone } from "../src/utils/phone";

const DRY_RUN = process.argv.includes("--dry-run");

export type Source =
  "VenueFoxerApplication.contactNumber" | "UserProfile.phone" | "User.phone";

export interface Row {
  id: string;
  value: string | null;
  /** Reads a number without its `+code`; Philippine when absent. */
  country?: string | null;
}

export type Outcome =
  | { kind: "unchanged" }
  | { kind: "normalize"; to: string }
  | { kind: "review"; reason: string };

/** What the backfill does with one saved number. */
export function planRow(row: Row): Outcome {
  if (row.value === null || row.value.trim() === "") {
    return { kind: "unchanged" };
  }
  const e164 = normalizePhone(row.value.trim(), row.country || "PH");
  if (!e164) return { kind: "review", reason: "not a valid phone number" };
  return e164 === row.value
    ? { kind: "unchanged" }
    : { kind: "normalize", to: e164 };
}

interface SourceReport {
  examined: number;
  unchanged: number;
  normalized: { id: string; from: string; to: string }[];
  review: { id: string; value: string; reason: string }[];
}

async function backfill(
  source: Source,
  rows: Row[],
  write: (id: string, value: string) => Promise<unknown>,
): Promise<SourceReport> {
  const report: SourceReport = {
    examined: 0,
    unchanged: 0,
    normalized: [],
    review: [],
  };
  for (const row of rows) {
    report.examined++;
    const outcome = planRow(row);
    if (outcome.kind === "unchanged") {
      report.unchanged++;
    } else if (outcome.kind === "review") {
      report.review.push({
        id: row.id,
        value: row.value!,
        reason: outcome.reason,
      });
    } else {
      try {
        if (!DRY_RUN) await write(row.id, outcome.to);
        report.normalized.push({
          id: row.id,
          from: row.value!,
          to: outcome.to,
        });
      } catch (err) {
        report.review.push({
          id: row.id,
          value: row.value!,
          reason: `write failed: ${err instanceof Error ? err.message : String(err)}`,
        });
      }
    }
  }
  printReport(source, report);
  return report;
}

async function main() {
  const applications = await prisma.venueFoxerApplication.findMany({
    select: { id: true, contactNumber: true, tinCountry: true },
  });
  await backfill(
    "VenueFoxerApplication.contactNumber",
    applications.map((a) => ({
      id: a.id,
      value: a.contactNumber,
      country: a.tinCountry,
    })),
    (id, contactNumber) =>
      prisma.venueFoxerApplication.update({
        where: { id },
        data: { contactNumber },
      }),
  );

  const profiles = await prisma.userProfile.findMany({
    where: { phone: { not: null } },
    select: { id: true, phone: true },
  });
  await backfill(
    "UserProfile.phone",
    profiles.map((p) => ({ id: p.id, value: p.phone })),
    (id, phone) =>
      prisma.userProfile.update({ where: { id }, data: { phone } }),
  );

  const users = await prisma.user.findMany({
    where: { phone: { not: null } },
    select: { id: true, phone: true },
  });
  await backfill(
    "User.phone",
    users.map((u) => ({ id: u.id, value: u.phone })),
    (id, phone) => prisma.user.update({ where: { id }, data: { phone } }),
  );
}

function printReport(source: Source, report: SourceReport) {
  console.log(`\n${DRY_RUN ? "[DRY RUN] " : ""}${source}`);
  console.log("─".repeat(60));
  console.log(`examined:                     ${report.examined}`);
  console.log(`already E.164 or empty:       ${report.unchanged}`);
  console.log(
    `${DRY_RUN ? "would normalize" : "normalized"}:${" ".repeat(DRY_RUN ? 14 : 19)}${report.normalized.length}`,
  );
  for (const n of report.normalized) {
    console.log(`  - id=${n.id} ${JSON.stringify(n.from)} → ${n.to}`);
  }
  console.log(`needs manual review:          ${report.review.length}`);
  for (const r of report.review) {
    console.log(
      `  - id=${r.id} ${JSON.stringify(r.value)} reason="${r.reason}"`,
    );
  }
}

if (typeof require !== "undefined" && require.main === module) {
  main()
    .catch((err) => {
      console.error("backfill-contact-numbers failed:", err);
      process.exitCode = 1;
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
