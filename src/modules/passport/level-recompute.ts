import { PERK_THRESHOLDS, calculateLevel } from "./passport.service";

export interface PathRecomputePlan {
  /** True when level or progress inside the level would change. */
  changed: boolean;
  level: number;
  currentXP: number;
  /** Perks for levels already reached that the passport does not hold yet. */
  missingPerks: string[];
}

/**
 * What the level-curve migration would do to one passport path: the level and
 * progress `totalXP` gives on the current curve, plus any perk a level
 * threshold already passed should have unlocked. Pure, so the migration script
 * can report a dry run and the rules can be tested without a database.
 *
 * It never lowers anything: a perk already held stays, and the new curve is
 * gentler, so a level only goes up.
 */
export function planPathRecompute(params: {
  path: string;
  totalXP: number;
  level: number;
  currentXP: number;
  perks: readonly string[];
}): PathRecomputePlan {
  const { level, currentXP } = calculateLevel(params.totalXP);
  const missingPerks = (PERK_THRESHOLDS[params.path] ?? [])
    .filter((t) => t.level <= level && !params.perks.includes(t.perk))
    .map((t) => t.perk);

  return {
    changed: level !== params.level || currentXP !== params.currentXP,
    level,
    currentXP,
    missingPerks,
  };
}
