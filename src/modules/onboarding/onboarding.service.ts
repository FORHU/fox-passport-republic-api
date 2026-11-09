import { UserPath } from "@prisma/client";
import { AppError } from "../../utils/errors";
import RewardService from "../reward/reward.service";
import OnboardingRepo from "./onboarding.repository";

/**
 * The steps the app reports, and the reward each one pays through
 * `RewardService` (xp-and-coins.md, section 3.4). A step with no `action`
 * is recorded and pays nothing yet.
 */
const STEPS: Record<string, { action?: string; path?: UserPath }> = {
  intro: { action: "finish_intro", path: UserPath.user },
  foxer_tour: {},
};

/**
 * Steps the server works out for itself from the account's data. They are not
 * in `STEPS`, so the app cannot report them: a client call to
 * `POST /onboarding/profile_complete` is refused as an unknown step.
 */
const DETECTED_STEPS: Record<string, { action?: string; path?: UserPath }> = {
  profile_complete: { action: "complete_profile", path: UserPath.user },
  id_verified: { action: "verify_identity", path: UserPath.user },
  // The checklist's "first booking": recorded, and pays nothing of its own
  // (booking and attending already pay).
  first_booking: {},
};

const filled = (value: string | null | undefined): boolean =>
  typeof value === "string" && value.trim() !== "";

export interface CompleteStepResult {
  step: string;
  completed: true;
  alreadyCompleted: boolean;
  reward: { xpAwarded: number; coinsAwarded: number };
}

export default class OnboardingSvc {
  static isKnownStep(step: string): boolean {
    return Object.prototype.hasOwnProperty.call(STEPS, step);
  }

  /**
   * Marks a step finished and pays its reward once. Safe to call again: a
   * finished step answers the same and pays nothing. The grant goes first and
   * is idempotent on its own key, so a failure between the two writes is
   * repaired by the app's next call instead of losing the reward.
   */
  static async complete(
    userId: string,
    step: string,
  ): Promise<CompleteStepResult> {
    if (!this.isKnownStep(step)) {
      throw new AppError(`Unknown onboarding step: ${step}`, 400);
    }

    if (await OnboardingRepo.isCompleted(userId, step)) {
      return {
        step,
        completed: true,
        alreadyCompleted: true,
        reward: { xpAwarded: 0, coinsAwarded: 0 },
      };
    }

    const { action, path } = STEPS[step];
    const reward = await OnboardingSvc.pay(userId, step, action, path);
    return { step, completed: true, alreadyCompleted: false, reward };
  }

  /**
   * Pays a step's reward (when it has one) and records the step. The grant
   * goes first and is idempotent on its own key, so a failure between the two
   * writes is repaired by the next attempt instead of losing the reward.
   */
  private static async pay(
    userId: string,
    step: string,
    action: string | undefined,
    path: UserPath | undefined,
  ) {
    let reward = { xpAwarded: 0, coinsAwarded: 0 };
    if (action) {
      const granted = await RewardService.grant({
        userId,
        path,
        action,
        refType: "onboarding",
        refId: step,
      });
      reward = {
        xpAwarded: granted.xpAwarded,
        coinsAwarded: granted.coinsAwarded,
      };
    }
    await OnboardingRepo.markCompleted(userId, step);
    return reward;
  }

  /**
   * Pays the steps the account's own data has now earned: a profile with a
   * photo, username, bio and city, and an approved ID. Safe to call at any
   * time and as often as wanted; a step already recorded is left alone.
   */
  static async syncDetectedSteps(userId: string): Promise<void> {
    const facts = await OnboardingRepo.findDetectionFacts(userId);
    if (!facts) return;

    const earned: string[] = [];
    const hasPhoto =
      filled(facts.profile?.imgId) ||
      filled(facts.imgId) ||
      filled(facts.image);
    if (
      hasPhoto &&
      filled(facts.username) &&
      filled(facts.bio) &&
      filled(facts.city)
    ) {
      earned.push("profile_complete");
    }
    if (facts.identityVerifiedAt) earned.push("id_verified");
    // Asked only while it is still open, so a finished checklist costs no query.
    if (
      !(await OnboardingRepo.isCompleted(userId, "first_booking")) &&
      (await OnboardingRepo.countActiveBookings(userId)) > 0
    ) {
      earned.push("first_booking");
    }

    for (const step of earned) {
      if (await OnboardingRepo.isCompleted(userId, step)) continue;
      const { action, path } = DETECTED_STEPS[step];
      await OnboardingSvc.pay(userId, step, action, path);
    }
  }

  /**
   * The steps this account has finished. The server-detected ones are worked
   * out first, so an account that was already complete before this existed is
   * paid and shown on its next visit. A failure there never hides the list.
   */
  static async listCompleted(userId: string) {
    await OnboardingSvc.syncDetectedSteps(userId).catch(() => {});
    const rows = await OnboardingRepo.findCompletedSteps(userId);
    return rows.map((r) => ({ step: r.step, completedAt: r.completedAt }));
  }
}
