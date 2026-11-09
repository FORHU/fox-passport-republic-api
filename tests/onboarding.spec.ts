import { describe, it, expect, vi, beforeEach } from "vitest";
import { UserPath } from "@prisma/client";

const state = vi.hoisted(() => ({
  done: new Set<string>(),
  facts: null as null | Record<string, unknown>,
}));

const completeFacts = {
  username: "ana",
  bio: "I like live music",
  city: "Manila",
  imgId: "img-1",
  image: null,
  identityVerifiedAt: null,
  profile: null,
};

vi.mock("../src/modules/onboarding/onboarding.repository", () => ({
  default: {
    isCompleted: vi.fn(async (u: string, s: string) =>
      state.done.has(`${u}:${s}`),
    ),
    markCompleted: vi.fn(async (u: string, s: string) => {
      state.done.add(`${u}:${s}`);
    }),
    findDetectionFacts: vi.fn(async () => state.facts),
    findCompletedSteps: vi.fn(async (u: string) =>
      [...state.done]
        .filter((k) => k.startsWith(`${u}:`))
        .map((k) => ({
          step: k.split(":")[1],
          completedAt: new Date("2026-11-06T00:00:00Z"),
        })),
    ),
  },
}));

vi.mock("../src/modules/reward/reward.service", () => ({
  default: {
    grant: vi.fn(async () => ({
      xpAwarded: 50,
      coinsAwarded: 20,
      newLevel: 2,
      newRank: "Newcomer",
    })),
  },
}));

import OnboardingSvc from "../src/modules/onboarding/onboarding.service";
import RewardService from "../src/modules/reward/reward.service";
import OnboardingRepo from "../src/modules/onboarding/onboarding.repository";

describe("OnboardingSvc", () => {
  beforeEach(() => {
    state.done.clear();
    state.facts = null;
    vi.clearAllMocks();
  });

  it("pays the citizen tour once, through RewardService", async () => {
    const res = await OnboardingSvc.complete("u1", "intro");

    expect(res).toEqual({
      step: "intro",
      completed: true,
      alreadyCompleted: false,
      reward: { xpAwarded: 50, coinsAwarded: 20 },
    });
    expect(RewardService.grant).toHaveBeenCalledWith({
      userId: "u1",
      path: UserPath.user,
      action: "finish_intro",
      refType: "onboarding",
      refId: "intro",
    });
    expect(OnboardingRepo.markCompleted).toHaveBeenCalledWith("u1", "intro");
  });

  it("answers a repeat call the same and pays nothing", async () => {
    await OnboardingSvc.complete("u1", "intro");
    vi.clearAllMocks();

    const again = await OnboardingSvc.complete("u1", "intro");

    expect(again.alreadyCompleted).toBe(true);
    expect(again.reward).toEqual({ xpAwarded: 0, coinsAwarded: 0 });
    expect(RewardService.grant).not.toHaveBeenCalled();
    expect(OnboardingRepo.markCompleted).not.toHaveBeenCalled();
  });

  it("records the Foxer tour without paying", async () => {
    const res = await OnboardingSvc.complete("u1", "foxer_tour");

    expect(res.reward).toEqual({ xpAwarded: 0, coinsAwarded: 0 });
    expect(RewardService.grant).not.toHaveBeenCalled();
    expect(OnboardingRepo.markCompleted).toHaveBeenCalledWith(
      "u1",
      "foxer_tour",
    );
  });

  it("refuses an unknown step with a 400 and records nothing", async () => {
    await expect(OnboardingSvc.complete("u1", "nope")).rejects.toMatchObject({
      status: 400,
    });
    await expect(
      OnboardingSvc.complete("u1", "constructor"),
    ).rejects.toMatchObject({ status: 400 });
    expect(RewardService.grant).not.toHaveBeenCalled();
    expect(OnboardingRepo.markCompleted).not.toHaveBeenCalled();
  });

  it("does not record the step if the grant fails, so a retry still pays", async () => {
    vi.mocked(RewardService.grant).mockRejectedValueOnce(new Error("db down"));

    await expect(OnboardingSvc.complete("u1", "intro")).rejects.toThrow(
      "db down",
    );
    expect(state.done.has("u1:intro")).toBe(false);

    const retry = await OnboardingSvc.complete("u1", "intro");
    expect(retry.reward.coinsAwarded).toBe(20);
  });

  it("lists only the caller's finished steps", async () => {
    await OnboardingSvc.complete("u1", "intro");
    await OnboardingSvc.complete("u2", "foxer_tour");

    const steps = await OnboardingSvc.listCompleted("u1");
    expect(steps.map((s) => s.step)).toEqual(["intro"]);
  });

  describe("server-detected steps", () => {
    it("pays the profile once, when photo, username, bio and city are all filled", async () => {
      state.facts = { ...completeFacts };

      await OnboardingSvc.syncDetectedSteps("u1");

      expect(RewardService.grant).toHaveBeenCalledTimes(1);
      expect(RewardService.grant).toHaveBeenCalledWith({
        userId: "u1",
        path: UserPath.user,
        action: "complete_profile",
        refType: "onboarding",
        refId: "profile_complete",
      });
      expect(state.done.has("u1:profile_complete")).toBe(true);

      vi.clearAllMocks();
      await OnboardingSvc.syncDetectedSteps("u1");
      expect(RewardService.grant).not.toHaveBeenCalled();
    });

    it.each([
      ["photo", { imgId: null }],
      ["username", { username: null }],
      ["bio", { bio: "   " }],
      ["city", { city: "" }],
    ])("pays nothing while the %s is missing", async (_name, missing) => {
      state.facts = { ...completeFacts, ...missing };

      await OnboardingSvc.syncDetectedSteps("u1");

      expect(RewardService.grant).not.toHaveBeenCalled();
      expect(OnboardingRepo.markCompleted).not.toHaveBeenCalled();
    });

    it("accepts the photo from the profile row or the sign-in image", async () => {
      state.facts = {
        ...completeFacts,
        imgId: null,
        profile: { imgId: "p-1" },
      };
      await OnboardingSvc.syncDetectedSteps("u1");
      expect(state.done.has("u1:profile_complete")).toBe(true);

      state.facts = { ...completeFacts, imgId: null, image: "https://x/y.png" };
      await OnboardingSvc.syncDetectedSteps("u2");
      expect(state.done.has("u2:profile_complete")).toBe(true);
    });

    it("pays the ID once, only when an admin has approved it", async () => {
      state.facts = { ...completeFacts, imgId: null };
      await OnboardingSvc.syncDetectedSteps("u1");
      expect(RewardService.grant).not.toHaveBeenCalled();

      state.facts = {
        ...completeFacts,
        imgId: null,
        identityVerifiedAt: new Date("2026-11-09T00:00:00Z"),
      };
      await OnboardingSvc.syncDetectedSteps("u1");
      expect(RewardService.grant).toHaveBeenCalledWith({
        userId: "u1",
        path: UserPath.user,
        action: "verify_identity",
        refType: "onboarding",
        refId: "id_verified",
      });

      vi.clearAllMocks();
      await OnboardingSvc.syncDetectedSteps("u1");
      expect(RewardService.grant).not.toHaveBeenCalled();
    });

    it("does nothing for an account that is gone", async () => {
      state.facts = null;
      await OnboardingSvc.syncDetectedSteps("ghost");
      expect(RewardService.grant).not.toHaveBeenCalled();
    });

    it("cannot be claimed by the app: the steps are unknown to complete()", async () => {
      for (const step of ["profile_complete", "id_verified"]) {
        await expect(OnboardingSvc.complete("u1", step)).rejects.toMatchObject({
          status: 400,
        });
      }
      expect(RewardService.grant).not.toHaveBeenCalled();
    });

    it("lists the detected steps on a visit, and still lists if detection fails", async () => {
      state.facts = { ...completeFacts };
      const steps = await OnboardingSvc.listCompleted("u1");
      expect(steps.map((s) => s.step)).toEqual(["profile_complete"]);

      vi.mocked(OnboardingRepo.findDetectionFacts).mockRejectedValueOnce(
        new Error("db down"),
      );
      await expect(OnboardingSvc.listCompleted("u1")).resolves.toHaveLength(1);
    });
  });
});
