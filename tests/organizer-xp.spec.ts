import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * The Organizer Passport path — ADR 0005. XP only for work that happened, paid
 * once per Event however often completion runs, and check-in XP capped per
 * Event so it cannot be farmed.
 *
 * The ledger is modelled in memory so the guarded updates behave as the
 * database's would: an `updateMany` whose `where` no longer matches changes
 * nothing and reports `count: 0`.
 */

const db = vi.hoisted(() => ({
  organizers: [] as { userId: string }[],
  ledger: new Map<string, { checkInXp: number; completedAt: Date | null }>(),
}));

vi.mock("../src/utils/prisma", () => ({
  prisma: {
    appointment: {
      findMany: vi.fn(
        async ({ where }: { where: { OR: { userId?: string }[] } }) => {
          const only = where.OR[0].userId;
          return only
            ? db.organizers.filter((o) => o.userId === only)
            : db.organizers;
        },
      ),
    },
    organizerEventXp: {
      upsert: vi.fn(
        async ({
          where,
        }: {
          where: { userId_eventId: { userId: string; eventId: string } };
        }) => {
          const { userId, eventId } = where.userId_eventId;
          const key = `${userId}:${eventId}`;
          if (!db.ledger.has(key)) {
            db.ledger.set(key, { checkInXp: 0, completedAt: null });
          }
          return db.ledger.get(key);
        },
      ),
      updateMany: vi.fn(
        async ({
          where,
          data,
        }: {
          where: {
            userId: string;
            eventId: string;
            checkInXp?: { lte: number };
            completedAt?: null;
          };
          data: { checkInXp?: { increment: number }; completedAt?: Date };
        }) => {
          const row = db.ledger.get(`${where.userId}:${where.eventId}`);
          if (!row) return { count: 0 };
          if (where.checkInXp && row.checkInXp > where.checkInXp.lte) {
            return { count: 0 };
          }
          if (where.completedAt === null && row.completedAt !== null) {
            return { count: 0 };
          }
          if (data.checkInXp) row.checkInXp += data.checkInXp.increment;
          if (data.completedAt) row.completedAt = data.completedAt;
          return { count: 1 };
        },
      ),
    },
  },
}));

const awardXP = vi.hoisted(() => vi.fn());
vi.mock("../src/modules/passport/passport.service", () => ({
  default: { awardXP },
}));

import OrganizerXpService, {
  ORGANIZER_XP,
} from "../src/modules/appointment/organizer-xp.service";

const totalAwarded = (userId: string) =>
  awardXP.mock.calls
    .filter(([id, path]) => id === userId && path === "organizer")
    .reduce((sum, [, , amount]) => sum + amount, 0);

beforeEach(() => {
  vi.clearAllMocks();
  db.organizers = [];
  db.ledger.clear();
});

describe("completion XP", () => {
  it("pays every Organizer of the Event on the Organizer path", async () => {
    db.organizers = [{ userId: "ben" }, { userId: "venue-staff" }];
    await OrganizerXpService.onEventCompleted("ev1");
    expect(totalAwarded("ben")).toBe(ORGANIZER_XP.eventCompleted);
    expect(totalAwarded("venue-staff")).toBe(ORGANIZER_XP.eventCompleted);
  });

  it("pays once however many times completion runs", async () => {
    db.organizers = [{ userId: "ben" }];
    await OrganizerXpService.onEventCompleted("ev1");
    await OrganizerXpService.onEventCompleted("ev1");
    expect(totalAwarded("ben")).toBe(ORGANIZER_XP.eventCompleted);
  });

  it("pays nobody for an Event with no Organizers", async () => {
    await OrganizerXpService.onEventCompleted("ev1");
    expect(awardXP).not.toHaveBeenCalled();
  });
});

describe("check-in XP", () => {
  it("pays an Organizer for each guest they check in", async () => {
    db.organizers = [{ userId: "ben" }];
    await OrganizerXpService.onGuestCheckedIn("ev1", "ben");
    await OrganizerXpService.onGuestCheckedIn("ev1", "ben");
    expect(totalAwarded("ben")).toBe(2 * ORGANIZER_XP.guestCheckedIn);
  });

  it("stops at the cap for one Event", async () => {
    db.organizers = [{ userId: "ben" }];
    const scans =
      ORGANIZER_XP.checkInCapPerEvent / ORGANIZER_XP.guestCheckedIn + 10;
    for (let i = 0; i < scans; i++) {
      await OrganizerXpService.onGuestCheckedIn("ev1", "ben");
    }
    expect(totalAwarded("ben")).toBe(ORGANIZER_XP.checkInCapPerEvent);
  });

  it("starts a fresh cap on another Event", async () => {
    db.organizers = [{ userId: "ben" }];
    const scans = ORGANIZER_XP.checkInCapPerEvent / ORGANIZER_XP.guestCheckedIn;
    for (let i = 0; i < scans; i++) {
      await OrganizerXpService.onGuestCheckedIn("ev1", "ben");
    }
    await OrganizerXpService.onGuestCheckedIn("ev2", "ben");
    expect(totalAwarded("ben")).toBe(
      ORGANIZER_XP.checkInCapPerEvent + ORGANIZER_XP.guestCheckedIn,
    );
  });

  it("pays nothing to someone who is not an Organizer — a Check-in Helper or the Owner", async () => {
    db.organizers = [{ userId: "ben" }];
    await OrganizerXpService.onGuestCheckedIn("ev1", "lea-helper");
    await OrganizerXpService.onGuestCheckedIn("ev1", "juan-owner");
    expect(awardXP).not.toHaveBeenCalled();
  });

  it("never lets an XP failure fail the check-in", async () => {
    db.organizers = [{ userId: "ben" }];
    awardXP.mockRejectedValueOnce(new Error("passport down"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(
      OrganizerXpService.onGuestCheckedIn("ev1", "ben"),
    ).resolves.toBeUndefined();
    spy.mockRestore();
  });
});
