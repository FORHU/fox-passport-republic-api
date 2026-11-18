import { describe, it, expect, afterAll } from "vitest";
import { prisma } from "../src/utils/prisma";
import ReferralSvc from "../src/modules/referral/referral.service";

const tag = `refcheck-${Date.now()}`;
const mk = (n: string) =>
  prisma.user.create({
    data: {
      email: `${tag}-${n}@example.test`,
      name: `${tag} ${n}`,
      systemRole: "user",
    } as never,
  });

describe("referral codes and attribution (real database)", () => {
  const ids: string[] = [];
  afterAll(async () => {
    await prisma.referral.deleteMany({ where: { referrerId: { in: ids } } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
  });

  it("makes one stable code, attaches it once, and blocks a second or own code", async () => {
    const a = await mk("a");
    const b = await mk("b");
    const c = await mk("c");
    ids.push(a.id, b.id, c.id);

    const code = await ReferralSvc.getOrCreateCode(a.id);
    expect(code).toHaveLength(8);
    expect(await ReferralSvc.getOrCreateCode(a.id)).toBe(code);

    expect(await ReferralSvc.apply(b.id, code.toLowerCase())).toEqual({
      status: "pending",
    });
    await expect(ReferralSvc.apply(b.id, code)).rejects.toMatchObject({
      status: 409,
    });
    await expect(ReferralSvc.apply(a.id, code)).rejects.toMatchObject({
      status: 400,
    });
    await expect(ReferralSvc.apply(c.id, "ZZZZZZZZ")).rejects.toMatchObject({
      status: 404,
    });

    expect(await ReferralSvc.getMine(a.id)).toMatchObject({
      code,
      referred: 1,
      rewarded: 0,
      hasReferrer: false,
      canApplyCode: true,
    });
    expect(await ReferralSvc.getMine(b.id)).toMatchObject({
      hasReferrer: true,
      canApplyCode: false,
    });
  });

  it("two requests at once for one account leave exactly one referrer", async () => {
    const a = await mk("p");
    const a2 = await mk("q");
    const f = await mk("r");
    ids.push(a.id, a2.id, f.id);
    const c1 = await ReferralSvc.getOrCreateCode(a.id);
    const c2 = await ReferralSvc.getOrCreateCode(a2.id);
    const results = await Promise.allSettled([
      ReferralSvc.apply(f.id, c1),
      ReferralSvc.apply(f.id, c2),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await prisma.referral.count({ where: { referredId: f.id } })).toBe(
      1,
    );
  });
});
