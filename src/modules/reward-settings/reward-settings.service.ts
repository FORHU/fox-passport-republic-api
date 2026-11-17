import { AppError } from "../../utils/errors";
import {
  AuditActor,
  listAuditForTarget,
  recordChange,
} from "../audit/audit.service";
import {
  REWARD_SETTINGS,
  REWARD_SETTING_KEYS,
  RewardSettingKey,
  isRewardSettingKey,
} from "./reward-settings.registry";
import RewardSettingsRepo, {
  RewardSettingRow,
} from "./reward-settings.repository";

/** How long a read is reused. A change shows within this long, on every instance. */
const CACHE_TTL_MS = 30_000;

export const REWARD_SETTING_AUDIT_ACTION = "rewardSetting.change";

export interface RewardSettingView {
  key: RewardSettingKey;
  label: string;
  description: string;
  /** What applies right now. */
  value: number;
  /** What applies when no admin has set one. */
  defaultValue: number;
  overridden: boolean;
  updatedBy: string | null;
  updatedAt: Date | null;
}

let cache: { at: number; rows: Map<string, RewardSettingRow> } | null = null;

const forgetCache = () => {
  cache = null;
};

/** A stored value is only used if it still passes the setting's own rule. */
function usable(key: RewardSettingKey, value: unknown): value is number {
  return (
    REWARD_SETTINGS[key].schema.validate(value, { convert: false }).error ===
    undefined
  );
}

async function overrides(): Promise<Map<string, RewardSettingRow>> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.rows;
  const rows = new Map(
    (await RewardSettingsRepo.findAll()).map((r) => [r.key, r]),
  );
  cache = { at: Date.now(), rows };
  return rows;
}

export default class RewardSettingsService {
  /**
   * The value that applies now. Never throws: if the settings cannot be read
   * (the table is not there yet, the database blinks), the default applies, so
   * earning Tokens and the leaderboards keep working. Logged, not silent.
   */
  static async get(key: RewardSettingKey): Promise<number> {
    try {
      const row = (await overrides()).get(key);
      if (row && usable(key, row.value)) return row.value;
    } catch (e) {
      console.error(
        `REWARD SETTING READ FAILED (${key}): using the default`,
        e,
      );
    }
    return REWARD_SETTINGS[key].defaultValue;
  }

  static async list(): Promise<RewardSettingView[]> {
    const rows = await RewardSettingsRepo.findAll();
    const byKey = new Map(rows.map((r) => [r.key, r]));
    return REWARD_SETTING_KEYS.map((key) => {
      const def = REWARD_SETTINGS[key];
      const row = byKey.get(key);
      const overridden = !!row && usable(key, row.value);
      return {
        key,
        label: def.label,
        description: def.description,
        value: overridden ? (row!.value as number) : def.defaultValue,
        defaultValue: def.defaultValue,
        overridden,
        updatedBy: overridden ? row!.updatedBy : null,
        updatedAt: overridden ? row!.updatedAt : null,
      };
    });
  }

  private static assertKnown(key: string): RewardSettingKey {
    if (!isRewardSettingKey(key)) {
      throw new AppError(`Unknown reward setting "${key}"`, 404);
    }
    return key;
  }

  /** Sets a setting and records who, when, and the value before and after. */
  static async set(
    rawKey: string,
    value: unknown,
    actor: AuditActor,
  ): Promise<RewardSettingView> {
    const key = this.assertKnown(rawKey);
    const { error, value: checked } = REWARD_SETTINGS[key].schema.validate(
      value,
      { convert: false },
    );
    if (error) {
      throw new AppError(
        `${REWARD_SETTINGS[key].label}: ${error.message}`,
        400,
      );
    }

    const previous = await this.effective(key);
    await RewardSettingsRepo.upsert(key, checked as number, actor.userId);
    forgetCache();
    await recordChange(actor, REWARD_SETTING_AUDIT_ACTION, key, {
      previous,
      current: checked,
    });
    return this.view(key);
  }

  /** Removes the admin's value so the default applies again. */
  static async reset(
    rawKey: string,
    actor: AuditActor,
  ): Promise<RewardSettingView> {
    const key = this.assertKnown(rawKey);
    const previous = await this.effective(key);
    const removed = await RewardSettingsRepo.remove(key);
    forgetCache();
    if (removed) {
      await recordChange(actor, REWARD_SETTING_AUDIT_ACTION, key, {
        previous,
        current: REWARD_SETTINGS[key].defaultValue,
        reset: true,
      });
    }
    return this.view(key);
  }

  static async history(rawKey: string, limit = 100) {
    const key = this.assertKnown(rawKey);
    return listAuditForTarget(key, limit);
  }

  /** The current value read straight from the database, not the cache. */
  private static async effective(key: RewardSettingKey): Promise<number> {
    const row = await RewardSettingsRepo.findByKey(key);
    return row && usable(key, row.value)
      ? row.value
      : REWARD_SETTINGS[key].defaultValue;
  }

  private static async view(key: RewardSettingKey): Promise<RewardSettingView> {
    const all = await this.list();
    return all.find((s) => s.key === key)!;
  }

  /** For tests: forget what was read. */
  static clearCache = forgetCache;
}
