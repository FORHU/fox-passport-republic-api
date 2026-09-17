/**
 * One-time backfill for the venue-affiliation gating change.
 *
 * Before this feature, attaching a venue to an EventTemplate required no
 * relationship at all — any Event Foxer could attach any venue they didn't
 * own. Existing `EventTemplateVenue` rows are real, already-in-use pairings,
 * so this creates a matching `approved` `VenueEventFoxerAffiliation` for each
 * one that doesn't already have an affiliation row — backfilling the
 * relationship the new attach-authorization check now requires, so current
 * hosts aren't locked out of venues they already use.
 *
 * Deliberately does NOT touch a pair that already has an affiliation row,
 * regardless of its status. A `pending`, `rejected`, or `revoked` row
 * represents a real decision someone already made (or an application still
 * awaiting one) — silently promoting any of those to `approved` would
 * override that decision. Those pairs are reported under "needs manual
 * review" instead: a human (support/admin) should look at why a template
 * already uses a venue whose affiliation was rejected/revoked/still pending,
 * rather than the script deciding for them.
 *
 * `initiatedBy` is recorded as `eventFoxer` for backfilled rows — an
 * arbitrary but harmless choice, since no real application/invite happened;
 * it only describes who *would* have needed to approve, which is moot for a
 * row created already `approved`.
 *
 * Usage:
 *   pnpm exec ts-node --files tools/backfill-venue-affiliations.ts [--dry-run]
 *
 * --dry-run reports what would happen without writing anything.
 * Safe to re-run: a pair that already has an affiliation (of any status) is
 * never modified, and a pair already backfilled is skipped on the next run.
 */

import { prisma } from "../src/utils/prisma";
import { AffiliationStatus, Prisma } from "@prisma/client";

const DRY_RUN = process.argv.includes("--dry-run");

interface Pair {
  venueId: string;
  eventFoxerId: string;
  templateIds: string[];
}

interface Report {
  templateVenueRowsExamined: number;
  skippedNullVenue: number;
  skippedOwnVenue: number;
  skippedOwnerNotEventFoxer: { eventFoxerId: string; venueId: string }[];
  uniquePairs: number;
  created: { venueId: string; eventFoxerId: string }[];
  existingApproved: number;
  existingPending: { id: string; venueId: string; eventFoxerId: string }[];
  existingRejected: { id: string; venueId: string; eventFoxerId: string }[];
  existingRevoked: { id: string; venueId: string; eventFoxerId: string }[];
  failed: { venueId: string; eventFoxerId: string; error: string }[];
}

function emptyReport(): Report {
  return {
    templateVenueRowsExamined: 0,
    skippedNullVenue: 0,
    skippedOwnVenue: 0,
    skippedOwnerNotEventFoxer: [],
    uniquePairs: 0,
    created: [],
    existingApproved: 0,
    existingPending: [],
    existingRejected: [],
    existingRevoked: [],
    failed: [],
  };
}

/** Groups EventTemplateVenue rows into unique (venue, organizer) pairs that
 * are candidates for backfill, applying the ownership/null filters. Pure
 * function over already-fetched rows so it's independently testable. */
export function collectCandidatePairs(
  rows: {
    templateId: string;
    venueId: string | null;
    template: { ownerId: string };
    venue: { mayorId: string } | null;
  }[],
  report: Report,
): Map<string, Pair> {
  const pairs = new Map<string, Pair>();

  for (const tv of rows) {
    report.templateVenueRowsExamined++;

    if (!tv.venueId || !tv.venue) {
      report.skippedNullVenue++;
      continue;
    }
    if (tv.template.ownerId === tv.venue.mayorId) {
      report.skippedOwnVenue++;
      continue;
    }

    const key = `${tv.venueId}:${tv.template.ownerId}`;
    const existing = pairs.get(key);
    if (existing) {
      existing.templateIds.push(tv.templateId);
    } else {
      pairs.set(key, {
        venueId: tv.venueId,
        eventFoxerId: tv.template.ownerId,
        templateIds: [tv.templateId],
      });
    }
  }

  return pairs;
}

async function main() {
  const report = emptyReport();

  const templateVenues = await prisma.eventTemplateVenue.findMany({
    where: { venueId: { not: null } },
    select: {
      templateId: true,
      venueId: true,
      template: { select: { ownerId: true } },
      venue: { select: { mayorId: true } },
    },
  });

  const pairs = collectCandidatePairs(templateVenues, report);
  report.uniquePairs = pairs.size;

  if (pairs.size === 0) {
    printReport(report);
    return;
  }

  for (const { venueId, eventFoxerId } of pairs.values()) {
    try {
      const existing = await prisma.venueEventFoxerAffiliation.findUnique({
        where: { venueId_eventFoxerId: { venueId, eventFoxerId } },
      });

      if (existing) {
        switch (existing.status) {
          case AffiliationStatus.approved:
            report.existingApproved++;
            break;
          case AffiliationStatus.pending:
            report.existingPending.push({ id: existing.id, venueId, eventFoxerId });
            break;
          case AffiliationStatus.rejected:
            report.existingRejected.push({ id: existing.id, venueId, eventFoxerId });
            break;
          case AffiliationStatus.revoked:
            report.existingRevoked.push({ id: existing.id, venueId, eventFoxerId });
            break;
        }
        continue; // never touch an existing row, regardless of status
      }

      const owner = await prisma.user.findUnique({
        where: { id: eventFoxerId },
        select: { roleType: true },
      });
      if (!owner || !owner.roleType.includes("eventFoxer")) {
        report.skippedOwnerNotEventFoxer.push({ eventFoxerId, venueId });
        continue;
      }

      if (DRY_RUN) {
        report.created.push({ venueId, eventFoxerId });
        continue;
      }

      await prisma.venueEventFoxerAffiliation.create({
        data: {
          venueId,
          eventFoxerId,
          initiatedBy: "eventFoxer",
          status: AffiliationStatus.approved,
          permissions: ["template:attach", "calendar:block"],
          reviewedAt: new Date(),
        },
      });
      report.created.push({ venueId, eventFoxerId });
    } catch (err) {
      // Unique-constraint race (P2002): another process backfilled/applied
      // for this exact pair between our findUnique and create. Not an
      // error — re-fetch and record its real status rather than crashing
      // the whole run.
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2002"
      ) {
        const nowExisting = await prisma.venueEventFoxerAffiliation.findUnique(
          { where: { venueId_eventFoxerId: { venueId, eventFoxerId } } },
        );
        if (nowExisting?.status === AffiliationStatus.approved) {
          report.existingApproved++;
        } else if (nowExisting) {
          report.failed.push({
            venueId,
            eventFoxerId,
            error: `Race: pair now exists with status "${nowExisting.status}" — needs manual review`,
          });
        }
        continue;
      }
      report.failed.push({
        venueId,
        eventFoxerId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  printReport(report);
}

function printReport(report: Report) {
  console.log(`\n${DRY_RUN ? "[DRY RUN] " : ""}Venue affiliation backfill report`);
  console.log("─".repeat(60));
  console.log(`EventTemplateVenue rows examined: ${report.templateVenueRowsExamined}`);
  console.log(`  skipped (no venue attached):    ${report.skippedNullVenue}`);
  console.log(`  skipped (organizer owns venue): ${report.skippedOwnVenue}`);
  console.log(`Unique venue/organizer pairs:      ${report.uniquePairs}`);
  console.log(
    `  ${DRY_RUN ? "would create" : "created"} (approved):    ${report.created.length}`,
  );
  console.log(`  already approved (untouched):    ${report.existingApproved}`);
  console.log(`  already pending (untouched):     ${report.existingPending.length}`);
  console.log(`  already rejected (untouched):    ${report.existingRejected.length}`);
  console.log(`  already revoked (untouched):     ${report.existingRevoked.length}`);
  console.log(
    `  owner not eventFoxer (skipped):  ${report.skippedOwnerNotEventFoxer.length}`,
  );
  console.log(`  failed:                          ${report.failed.length}`);

  const needsReview = [
    ...report.existingPending.map((p) => ({ ...p, reason: "pending" })),
    ...report.existingRejected.map((p) => ({ ...p, reason: "rejected" })),
    ...report.existingRevoked.map((p) => ({ ...p, reason: "revoked" })),
    ...report.skippedOwnerNotEventFoxer.map((p) => ({
      ...p,
      id: undefined,
      reason: "owner lost eventFoxer role",
    })),
    ...report.failed.map((f) => ({ ...f, id: undefined, reason: f.error })),
  ];

  if (needsReview.length > 0) {
    console.log(
      `\n${needsReview.length} pair(s) need manual review (a template already uses a venue whose affiliation is not clean):`,
    );
    for (const item of needsReview) {
      console.log(
        `  - venue=${item.venueId} eventFoxer=${item.eventFoxerId} reason="${item.reason}"${item.id ? ` affiliationId=${item.id}` : ""}`,
      );
    }
  }
}

if (typeof require !== "undefined" && require.main === module) {
  main()
    .catch((err) => {
      console.error("backfill-venue-affiliations failed:", err);
      process.exitCode = 1;
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
