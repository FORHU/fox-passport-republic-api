import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Reward settings (RR-8, api#303): the rules for reading a setting (admin's
 * value, else the default, never an error) and for changing one (validated,
 * and recorded with the value before and after). The database is mocked.
 */

const db = vi.hoisted(() => ({
  rows: new Map<
    string,
    { key: string; value: unknown; updatedBy: string; updatedAt: Date }
  >(),
  failReads: false,
}));

import * as auditModule from "../src/modules/audit/audit.service";
import RewardSettingsRepo from "../src/modules/reward-settings/reward-settings.repository";
import RewardSettingsService from "../src/modules/reward-settings/reward-settings.service";
import { REWARD_SETTINGS } from "../src/modules/reward-settings/reward-settings.registry";
import { AppError } from "../src/utils/errors";

const ACTOR = { userId: "admin-1", email: "admin@example.com" };
const CAP = "dailyLogin.monthlyCapTokens";

let recordChange: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  db.rows.clear();
  db.failReads = false;
  RewardSettingsService.clearCache();
  vi.restoreAllMocks();
  recordChange = vi.spyOn(auditModule, "recordChange").mockResolvedValue();
  vi.spyOn(RewardSettingsRepo, "findAll").mockImplementation(async () => {
    if (db.failReads) throw new Error("relation does not exist");
    return [...db.rows.values()];
  });
  vi.spyOn(RewardSettingsRepo, "findByKey").mockImplementation(
    async (key: string) => db.rows.get(key) ?? null,
  );
  vi.spyOn(RewardSettingsRepo, "upsert").mockImplementation(
    async (key: string, value: number, updatedBy: string) => {
      const row = { key, value, updatedBy, updatedAt: new Date() };
      db.rows.set(key, row);
      return row;
    },
  );
  vi.spyOn(RewardSettingsRepo, "remove").mockImplementation(
    async (key: string) => db.rows.delete(key),
  );
});

describe("reading a setting", () => {
  it("is the default until an admin sets one", async () => {
    expect(await RewardSettingsService.get(CAP)).toBe(
      REWARD_SETTINGS[CAP].defaultValue,
    );
  });

  it("is the admin's value once set", async () => {
    await RewardSettingsService.set(CAP, 250, ACTOR);
    expect(await RewardSettingsService.get(CAP)).toBe(250);
  });

  it("falls back to the default, not an error, when it cannot be read", async () => {
    db.failReads = true;
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await RewardSettingsService.get(CAP)).toBe(
      REWARD_SETTINGS[CAP].defaultValue,
    );
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it("ignores a stored value that no longer passes the rule", async () => {
    db.rows.set(CAP, {
      key: CAP,
      value: -5,
      updatedBy: "x",
      updatedAt: new Date(),
    });
    expect(await RewardSettingsService.get(CAP)).toBe(
      REWARD_SETTINGS[CAP].defaultValue,
    );
  });
});

describe("changing a setting", () => {
  it.each([
    ["a negative number", -1],
    ["a fraction", 1.5],
    ["a number as text", "100"],
    ["nothing", null],
    ["more than the limit", 100_001],
  ])("refuses %s", async (_label, value) => {
    await expect(
      RewardSettingsService.set(CAP, value, ACTOR),
    ).rejects.toMatchObject({ status: 400 });
    expect(db.rows.size).toBe(0);
    expect(recordChange).not.toHaveBeenCalled();
  });

  it("refuses a setting that does not exist", async () => {
    await expect(
      RewardSettingsService.set("tokens.balance", 999, ACTOR),
    ).rejects.toBeInstanceOf(AppError);
    await expect(
      RewardSettingsService.set("tokens.balance", 999, ACTOR),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("accepts zero", async () => {
    const view = await RewardSettingsService.set(
      "dailyLogin.stepTokens",
      0,
      ACTOR,
    );
    expect(view.value).toBe(0);
    expect(view.overridden).toBe(true);
  });

  it("records who changed it, with the value before and after", async () => {
    await RewardSettingsService.set(CAP, 250, ACTOR);
    await RewardSettingsService.set(CAP, 300, ACTOR);

    expect(recordChange).toHaveBeenNthCalledWith(
      1,
      ACTOR,
      "rewardSetting.change",
      CAP,
      { previous: REWARD_SETTINGS[CAP].defaultValue, current: 250 },
    );
    expect(recordChange).toHaveBeenNthCalledWith(
      2,
      ACTOR,
      "rewardSetting.change",
      CAP,
      { previous: 250, current: 300 },
    );
  });

  it("is seen straight away, not after the cache expires", async () => {
    expect(await RewardSettingsService.get(CAP)).toBe(
      REWARD_SETTINGS[CAP].defaultValue,
    );
    await RewardSettingsService.set(CAP, 7, ACTOR);
    expect(await RewardSettingsService.get(CAP)).toBe(7);
  });
});

describe("resetting a setting", () => {
  it("brings the default back and records it", async () => {
    await RewardSettingsService.set(CAP, 250, ACTOR);
    vi.clearAllMocks();

    const view = await RewardSettingsService.reset(CAP, ACTOR);

    expect(view.overridden).toBe(false);
    expect(view.value).toBe(REWARD_SETTINGS[CAP].defaultValue);
    expect(await RewardSettingsService.get(CAP)).toBe(
      REWARD_SETTINGS[CAP].defaultValue,
    );
    expect(recordChange).toHaveBeenCalledWith(
      ACTOR,
      "rewardSetting.change",
      CAP,
      {
        previous: 250,
        current: REWARD_SETTINGS[CAP].defaultValue,
        reset: true,
      },
    );
  });

  it("records nothing when there was nothing to reset", async () => {
    await RewardSettingsService.reset(CAP, ACTOR);
    expect(recordChange).not.toHaveBeenCalled();
  });
});

describe("listing the settings", () => {
  it("shows every setting with its default and what applies now", async () => {
    await RewardSettingsService.set(CAP, 250, ACTOR);
    const list = await RewardSettingsService.list();

    expect(list.map((s) => s.key).sort()).toEqual(
      Object.keys(REWARD_SETTINGS).sort(),
    );
    const cap = list.find((s) => s.key === CAP)!;
    expect(cap).toMatchObject({
      value: 250,
      defaultValue: REWARD_SETTINGS[CAP].defaultValue,
      overridden: true,
      updatedBy: "admin-1",
    });
    const other = list.find((s) => s.key === "leaderboard.pawsPrior")!;
    expect(other.overridden).toBe(false);
    expect(other.updatedBy).toBeNull();
  });
});
