import crypto from "node:crypto";
import { AppError, badRequest, conflict, notFound } from "../../utils/errors";
import ReferralRepo, {
  isUniqueViolation,
  REFERRAL_CODE_ALPHABET,
  REFERRAL_CODE_LENGTH,
} from "./referral.repository";
import { ApplyReferralResult, MyReferral } from "./referral.types";

const CODE_ATTEMPTS = 5;

/** A random code from the alphabet people can read without mixing characters up. */
export function generateReferralCode(): string {
  let code = "";
  for (let i = 0; i < REFERRAL_CODE_LENGTH; i++) {
    code +=
      REFERRAL_CODE_ALPHABET[crypto.randomInt(REFERRAL_CODE_ALPHABET.length)];
  }
  return code;
}

/** What someone typed or pasted, as the code it names: no spaces or dashes, upper case. */
export function normalizeReferralCode(raw: string): string {
  return raw.replace(/[\s-]/g, "").toUpperCase();
}

const CODE_SHAPE = new RegExp(
  `^[${REFERRAL_CODE_ALPHABET}]{${REFERRAL_CODE_LENGTH}}$`,
);

export default class ReferralSvc {
  /**
   * This person's code, made the first time it is asked for. Safe under two
   * requests at once: the code is only written to an account that has none,
   * and the loser reads the winner's.
   */
  static async getOrCreateCode(userId: string): Promise<string> {
    const existing = await ReferralRepo.findCodeOf(userId);
    if (existing) return existing;

    for (let attempt = 0; attempt < CODE_ATTEMPTS; attempt++) {
      try {
        const code = generateReferralCode();
        if (await ReferralRepo.setCodeIfEmpty(userId, code)) return code;
        const now = await ReferralRepo.findCodeOf(userId);
        if (now) return now;
      } catch (e) {
        // Another account holds this code: draw a new one.
        if (!isUniqueViolation(e)) throw e;
      }
    }
    throw new AppError("Could not make a referral code. Try again.", 503);
  }

  /** The code to share, who has used it, and whether this person can enter one. */
  static async getMine(userId: string): Promise<MyReferral> {
    const code = await this.getOrCreateCode(userId);
    const [counts, own] = await Promise.all([
      ReferralRepo.countFor(userId),
      ReferralRepo.findReferralOf(userId),
    ]);
    const hasReferrer = own !== null;
    return {
      code,
      referred: counts.referred,
      rewarded: counts.rewarded,
      hasReferrer,
      canApplyCode:
        !hasReferrer && !(await ReferralRepo.hasPaidBooking(userId)),
    };
  }

  /**
   * Attaches a friend's code to this account. Pays nothing: Tokens go to both
   * people only when this account's first paid booking is attended. Allowed
   * once, and only before a first paid booking, so a code cannot be added
   * after the fact to claim a reward.
   */
  static async apply(
    userId: string,
    rawCode: string,
  ): Promise<ApplyReferralResult> {
    const code = normalizeReferralCode(rawCode);
    if (!CODE_SHAPE.test(code)) {
      throw badRequest("That is not a referral code.");
    }
    if (await ReferralRepo.findReferralOf(userId)) {
      throw conflict("You have already used a referral code.");
    }
    if (await ReferralRepo.hasPaidBooking(userId)) {
      throw badRequest("A referral code only works before your first booking.");
    }
    const owner = await ReferralRepo.findOwnerOfCode(code);
    if (!owner) throw notFound("Referral code");
    if (owner.id === userId) {
      throw badRequest("You can't use your own referral code.");
    }
    try {
      await ReferralRepo.create({
        referrerId: owner.id,
        referredId: userId,
        code,
      });
    } catch (e) {
      // Two requests at once: the account already has its referrer.
      if (isUniqueViolation(e)) {
        throw conflict("You have already used a referral code.");
      }
      throw e;
    }
    return { status: "pending" };
  }
}
