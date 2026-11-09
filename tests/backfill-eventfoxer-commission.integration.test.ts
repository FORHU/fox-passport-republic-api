import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "../src/utils/prisma";
import { backfillEventFoxerCommission } from "../tools/backfill-eventfoxer-commission";

/**
 * The backfill against a real database: it sets a starting rate from the
 * EventFoxer's templates, writes nothing on a dry run, and never overwrites a
 * rate that is already set. Scoped to the users this spec creates
 * (`onlyUserIds`), and it deletes only those users, whose templates cascade.
 */
describe("backfillEventFoxerCommission (database)", () => {
  const runId = Math.random().toString(36).substring(7);
  const ids = { mixed: "", preset: "", noTemplates: "", citizen: "" };

  const makeUser = async (
    key: keyof typeof ids,
    roleType: ("eventFoxer" | "venueFoxer")[],
    commissionPct = 0,
  ) => {
    const user = await prisma.user.create({
      data: {
        email: `backfill-${key}-${runId}@example.com`,
        name: `Backfill ${key} ${runId}`,
        roleType,
        commissionPct,
      },
    });
    ids[key] = user.id;
    return user.id;
  };

  const makeTemplate = (ownerId: string, hostMarkupPct: number) =>
    prisma.eventTemplate.create({
      data: {
        ownerId,
        name: `Backfill template ${runId}`,
        description: "desc",
        category: "corporate",
        hostMarkupPct,
      },
    });

  const rateOf = async (id: string) =>
    (
      await prisma.user.findUniqueOrThrow({
        where: { id },
        select: { commissionPct: true },
      })
    ).commissionPct.toNumber();

  beforeAll(async () => {
    // Templates disagree: 10 is used twice, 20 once → 10.
    const mixed = await makeUser("mixed", ["eventFoxer"]);
    await makeTemplate(mixed, 10);
    await makeTemplate(mixed, 20);
    await makeTemplate(mixed, 10);

    // Already chose a rate: must keep it, not take the template's 30.
    const preset = await makeUser("preset", ["eventFoxer"], 15);
    await makeTemplate(preset, 30);

    await makeUser("noTemplates", ["eventFoxer"]);

    // Not an EventFoxer: never examined, even with a marked-up template.
    const citizen = await makeUser("citizen", ["venueFoxer"]);
    await makeTemplate(citizen, 40);
  });

  afterAll(async () => {
    await prisma.user.deleteMany({
      where: { id: { in: Object.values(ids).filter(Boolean) } },
    });
  });

  const only = () => Object.values(ids);

  it("a dry run reports what it would set and writes nothing", async () => {
    const report = await backfillEventFoxerCommission({
      dryRun: true,
      onlyUserIds: only(),
    });

    expect(report.eventFoxers).toBe(3);
    expect(report.set).toEqual([
      expect.objectContaining({ userId: ids.mixed, rate: 10, templates: 3 }),
    ]);
    expect(report.skippedAlreadySet).toBe(1);
    expect(report.skippedNoTemplates).toBe(1);
    expect(await rateOf(ids.mixed)).toBe(0);
  });

  it("sets the most-used rate and leaves everyone else alone", async () => {
    const report = await backfillEventFoxerCommission({
      dryRun: false,
      onlyUserIds: only(),
    });

    expect(report.set.map((s) => s.userId)).toEqual([ids.mixed]);
    expect(report.failed).toEqual([]);
    expect(await rateOf(ids.mixed)).toBe(10);
    expect(await rateOf(ids.preset)).toBe(15);
    expect(await rateOf(ids.noTemplates)).toBe(0);
    expect(await rateOf(ids.citizen)).toBe(0);
  });

  it("is safe to run again: a rate it already set is not touched", async () => {
    await makeTemplate(ids.mixed, 50);
    await makeTemplate(ids.mixed, 50);
    await makeTemplate(ids.mixed, 50);

    const report = await backfillEventFoxerCommission({
      dryRun: false,
      onlyUserIds: only(),
    });

    expect(report.set).toEqual([]);
    expect(report.skippedAlreadySet).toBe(2);
    expect(await rateOf(ids.mixed)).toBe(10);
  });
});
