import Joi from "joi";

// The agreed field limits. Kept in step with the web's shared/lib/limits.ts.
export const NAME_MAX = 100;
export const DESCRIPTION_MAX = 500;
export const LONG_DESCRIPTION_MAX = 2000;
// Event descriptions run 100-500 words in the web builder.
export const EVENT_DESCRIPTION_MAX = 5000;
export const QUANTITY_MAX = 100_000;
export const PRICE_MAX = 9_999_999.99;

const maxMessage = (label: string, max: number) =>
  `${label} can be up to ${max.toLocaleString("en-US")} characters.`;

/** Joi rule for a name: trimmed, 1-100 characters. */
export const nameJoi = () =>
  Joi.string()
    .trim()
    .max(NAME_MAX)
    .messages({
      "string.empty": "A name is required.",
      "string.max": maxMessage("Names", NAME_MAX),
    });

/** Joi rule for a description, up to `max` characters (500 unless the field is long). */
export const descriptionJoi = (max = DESCRIPTION_MAX) =>
  Joi.string()
    .trim()
    .max(max)
    .messages({ "string.max": maxMessage("Descriptions", max) });

/** Joi rule for a quantity, capacity or guest count: a whole number, 1-100,000. */
export const quantityJoi = () =>
  Joi.number()
    .integer()
    .min(1)
    .max(QUANTITY_MAX)
    .messages({
      "number.base": "Enter a whole number.",
      "number.integer": "Enter a whole number.",
      "number.min": "Enter a number of at least 1.",
      "number.max": `Enter a number no higher than ${QUANTITY_MAX.toLocaleString("en-US")}.`,
    });

/** Joi rule for a price, rate or amount: 0 to 9,999,999.99 with at most 2 decimals. */
export const priceJoi = () =>
  Joi.number()
    .min(0)
    .max(PRICE_MAX)
    .custom((value, helpers) =>
      Math.round(value * 100) / 100 === value
        ? value
        : helpers.error("number.precision"),
    )
    .messages({
      "number.base": "Enter a valid price.",
      "number.min": "Prices cannot be negative.",
      "number.max": `Prices can be up to ${PRICE_MAX.toLocaleString("en-US")}.`,
      "number.precision": "Prices can have at most 2 decimal places.",
    });
