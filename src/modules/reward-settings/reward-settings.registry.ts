import Joi from "joi";
import {
  DAILY_LOGIN_MONTHLY_CAP_TOKENS,
  DAILY_LOGIN_STEP_TOKENS,
  LEADERBOARD_PAWS_PRIOR,
  LEADERBOARD_TOP_RATED_MIN_BOOKINGS,
} from "../../config";

/**
 * The reward settings an admin can change (RR-8, api#303). Each used to be an
 * environment variable; the environment value stays as the default, so nothing
 * changes until an admin sets one.
 *
 * Only settings that something reads belong here. A key nothing consumes would
 * let an admin "change" a number that does nothing.
 */
export interface RewardSettingDefinition {
  label: string;
  description: string;
  /** What applies when no admin has set it: the environment value, or the built-in. */
  defaultValue: number;
  schema: Joi.NumberSchema;
}

const wholeNumber = (max: number) => Joi.number().integer().min(0).max(max);

export const REWARD_SETTINGS = {
  "dailyLogin.monthlyCapTokens": {
    label: "Daily login: monthly cap",
    description:
      "The most Tokens daily login pays one person in a Manila month. Once reached it pays nothing until next month.",
    defaultValue: DAILY_LOGIN_MONTHLY_CAP_TOKENS,
    schema: wholeNumber(100_000),
  },
  "dailyLogin.stepTokens": {
    label: "Daily login: daily step",
    description:
      "How many more Tokens each day of the 7-day cycle pays than the day before. 0 pays the same every day.",
    defaultValue: DAILY_LOGIN_STEP_TOKENS,
    schema: wholeNumber(1_000),
  },
  "leaderboard.pawsPrior": {
    label: "Leaderboard: Paws prior",
    description:
      "The weight of the platform average when ranking Top rated, so one 5-star review cannot beat many good ones. Higher pulls new Foxers further toward the average.",
    defaultValue: LEADERBOARD_PAWS_PRIOR,
    schema: wholeNumber(1_000),
  },
  "leaderboard.topRatedMinBookings": {
    label: "Leaderboard: minimum bookings",
    description:
      "Completed bookings a Foxer needs to appear on Top rated. Leaderboards refresh within five minutes.",
    defaultValue: LEADERBOARD_TOP_RATED_MIN_BOOKINGS,
    schema: wholeNumber(1_000),
  },
} satisfies Record<string, RewardSettingDefinition>;

export type RewardSettingKey = keyof typeof REWARD_SETTINGS;

export const REWARD_SETTING_KEYS = Object.keys(
  REWARD_SETTINGS,
) as RewardSettingKey[];

export const isRewardSettingKey = (key: string): key is RewardSettingKey =>
  Object.prototype.hasOwnProperty.call(REWARD_SETTINGS, key);
