import type { Response } from "express";
import Joi from "joi";

export const END_BEFORE_START_MESSAGE =
  "The end date must be after the start date.";

/** Options for `schema.validate`: report every problem, not just the first. */
export const VALIDATE_ALL = { abortEarly: false } as const;

export interface FieldError {
  field: string;
  message: string;
}

// "endDate" -> "End date", "mediaUrls" -> "Media urls"
const humanize = (key: string) => {
  const words = key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_.]+/g, " ")
    .toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
};

const count = (n: unknown) =>
  typeof n === "number" ? n.toLocaleString("en-US") : String(n);

/**
 * Joi's own text quotes the field name and can name a `ref:`
 * ("\"endDate\" must be greater than or equal to \"ref:date\""). That is for
 * developers. A message written with `.messages()` never starts with a quote, so
 * it is kept; Joi's default is rewritten from the rule that failed.
 */
function friendlyMessage(detail: Joi.ValidationErrorItem): string {
  if (!detail.message.startsWith('"')) return detail.message;

  const label = humanize(
    String(detail.path[detail.path.length - 1] ?? "value"),
  );
  const { limit } = detail.context ?? {};
  switch (detail.type) {
    case "any.required":
    case "string.empty":
    case "array.min":
      return `${label} is required.`;
    case "string.max":
      return `${label} can be up to ${count(limit)} characters.`;
    case "string.min":
      return `${label} must be at least ${count(limit)} characters.`;
    case "number.base":
      return `${label} must be a number.`;
    case "number.integer":
      return `${label} must be a whole number.`;
    case "number.min":
      return `${label} must be at least ${count(limit)}.`;
    case "number.max":
      return `${label} must be at most ${count(limit)}.`;
    case "array.max":
      return `${label} can have up to ${count(limit)} items.`;
    case "string.uri":
      return `${label} must be a valid link.`;
    case "date.base":
    case "date.format":
      return `${label} must be a valid date.`;
    case "date.min":
    case "date.greater":
      return `${label} can't be before the start date.`;
    case "any.only":
      return `${label} isn't one of the allowed options.`;
    default:
      return `Check ${label.toLowerCase()} and try again.`;
  }
}

/** A Joi error as the client sees it: plain sentences, never Joi's text. */
export function validationPayload(error: Joi.ValidationError) {
  const fields: FieldError[] = error.details.map((d) => ({
    field: d.path.join("."),
    message: friendlyMessage(d),
  }));
  return {
    message: fields[0]?.message ?? "The request was not valid.",
    code: "VALIDATION",
    fields,
  };
}

/** Answers a failed `schema.validate` with 400. `success` is for responses that carry it. */
export function sendValidationError(
  res: Response,
  error: Joi.ValidationError,
  opts: { success?: boolean } = {},
) {
  return res.status(400).json({
    ...(opts.success ? { success: false } : {}),
    ...validationPayload(error),
  });
}

/**
 * A date that must fall after a sibling date: the first of `startKeys` that is
 * set. Without a start there is nothing to compare, so the end passes.
 */
export const endAfter = (startKeys: string[]) =>
  Joi.date().custom((value: Date, helpers) => {
    const siblings = (helpers.state.ancestors[0] ?? {}) as Record<
      string,
      unknown
    >;
    const raw = startKeys.map((k) => siblings[k]).find((v) => v != null);
    const start = raw == null ? null : new Date(raw as string | number | Date);
    if (start && !Number.isNaN(start.getTime()) && value <= start) {
      return helpers.message({ custom: END_BEFORE_START_MESSAGE });
    }
    return value;
  });
