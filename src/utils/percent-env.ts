/**
 * Boot-time reading of a percentage from the environment.
 *
 * `PLATFORM_FEE_PERCENT` is read as `Number(process.env.X || 5)`, so a typo
 * ("5%", "five") becomes NaN and every fee computed from it is NaN too, and a
 * value like 300 is taken at face value. Neither fails until a client is
 * charged. A percentage that prices money is checked once, at startup, instead:
 * unset or empty uses the default, anything else must be a number from 0 to 100.
 *
 * The unit is percent (3 = 3%), never a fraction (0.03): a fraction is a valid
 * percentage too, so it can't be told apart and would quietly charge 0.03%.
 */
export function readPercentEnv(
  name: string,
  value: string | undefined,
  fallback: number,
): number {
  if (value === undefined || value.trim() === "") return fallback;

  const parsed = Number(value.trim());
  if (!Number.isFinite(parsed)) {
    throw new Error(
      `${name} is "${value}", which is not a number. Refusing to start: it is ` +
        `a percentage that prices every charge (for example 3 for 3%).`,
    );
  }
  if (parsed < 0 || parsed > 100) {
    throw new Error(
      `${name} is ${parsed}. Refusing to start: it must be a percentage from 0 ` +
        `to 100 (for example 3 for 3%).`,
    );
  }
  return parsed;
}
