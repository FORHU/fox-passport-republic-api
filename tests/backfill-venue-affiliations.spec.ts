import { describe, it, expect } from "vitest";
import { collectCandidatePairs } from "../tools/backfill-venue-affiliations";

function emptyReport() {
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

describe("backfill-venue-affiliations: collectCandidatePairs", () => {
  it("skips rows with no venue attached", () => {
    const report = emptyReport();
    const pairs = collectCandidatePairs(
      [
        {
          templateId: "t1",
          venueId: null,
          template: { ownerId: "o1" },
          venue: null,
        },
      ],
      report as any,
    );
    expect(pairs.size).toBe(0);
    expect(report.skippedNullVenue).toBe(1);
  });

  it("skips rows where the organizer owns the venue", () => {
    const report = emptyReport();
    const pairs = collectCandidatePairs(
      [
        {
          templateId: "t1",
          venueId: "v1",
          template: { ownerId: "o1" },
          venue: { mayorId: "o1" },
        },
      ],
      report as any,
    );
    expect(pairs.size).toBe(0);
    expect(report.skippedOwnVenue).toBe(1);
  });

  it("collects one pair for a cross-owner template-venue row", () => {
    const report = emptyReport();
    const pairs = collectCandidatePairs(
      [
        {
          templateId: "t1",
          venueId: "v1",
          template: { ownerId: "o1" },
          venue: { mayorId: "mayor1" },
        },
      ],
      report as any,
    );
    expect(pairs.size).toBe(1);
    expect(pairs.get("v1:o1")).toEqual({
      venueId: "v1",
      eventFoxerId: "o1",
      templateIds: ["t1"],
    });
  });

  it("deduplicates multiple templates using the same venue and organizer into one pair", () => {
    const report = emptyReport();
    const pairs = collectCandidatePairs(
      [
        {
          templateId: "t1",
          venueId: "v1",
          template: { ownerId: "o1" },
          venue: { mayorId: "mayor1" },
        },
        {
          templateId: "t2",
          venueId: "v1",
          template: { ownerId: "o1" },
          venue: { mayorId: "mayor1" },
        },
      ],
      report as any,
    );
    expect(pairs.size).toBe(1);
    expect(pairs.get("v1:o1")?.templateIds).toEqual(["t1", "t2"]);
  });

  it("keeps distinct pairs for different organizers on the same venue", () => {
    const report = emptyReport();
    const pairs = collectCandidatePairs(
      [
        {
          templateId: "t1",
          venueId: "v1",
          template: { ownerId: "o1" },
          venue: { mayorId: "mayor1" },
        },
        {
          templateId: "t2",
          venueId: "v1",
          template: { ownerId: "o2" },
          venue: { mayorId: "mayor1" },
        },
      ],
      report as any,
    );
    expect(pairs.size).toBe(2);
  });

  it("counts every row examined even across mixed skip reasons", () => {
    const report = emptyReport();
    collectCandidatePairs(
      [
        {
          templateId: "t1",
          venueId: null,
          template: { ownerId: "o1" },
          venue: null,
        },
        {
          templateId: "t2",
          venueId: "v1",
          template: { ownerId: "o1" },
          venue: { mayorId: "o1" },
        },
        {
          templateId: "t3",
          venueId: "v2",
          template: { ownerId: "o1" },
          venue: { mayorId: "mayor2" },
        },
      ],
      report as any,
    );
    expect(report.templateVenueRowsExamined).toBe(3);
    expect(report.skippedNullVenue).toBe(1);
    expect(report.skippedOwnVenue).toBe(1);
  });
});
