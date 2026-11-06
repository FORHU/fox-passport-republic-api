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
    return { step, completed: true, alreadyCompleted: false, reward };
  }

  static async listCompleted(userId: string) {
    const rows = await OnboardingRepo.findCompletedSteps(userId);
    return rows.map((r) => ({ step: r.step, completedAt: r.completedAt }));
  }
}
