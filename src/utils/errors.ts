import type { Response } from "express";
import { isDev } from "../config";

const DEFAULT_CODES: Record<number, string> = {
  400: "BAD_REQUEST",
  401: "UNAUTHORIZED",
  403: "FORBIDDEN",
  404: "NOT_FOUND",
  409: "CONFLICT",
  422: "UNPROCESSABLE",
  429: "RATE_LIMITED",
};

/**
 * An error the client is meant to see: it carries the HTTP status and a stable
 * `code` a frontend can branch on without matching message text. Services throw
 * these (or a module subclass); the global error handler turns them into a
 * response. Anything that is not an AppError is treated as a bug.
 */
export class AppError extends Error {
  public readonly code: string;

  constructor(
    message: string,
    public readonly status: number = 500,
    code?: string,
  ) {
    super(message);
    this.name = new.target.name;
    this.code =
      code ?? DEFAULT_CODES[status] ?? (status >= 500 ? "INTERNAL" : "ERROR");
  }
}

export const badRequest = (message: string, code?: string) =>
  new AppError(message, 400, code);
export const unauthorized = (message = "Unauthorized", code?: string) =>
  new AppError(message, 401, code);
export const forbidden = (message = "Forbidden", code?: string) =>
  new AppError(message, 403, code);
export const notFound = (what: string, code?: string) =>
  new AppError(`${what} not found`, 404, code);
export const conflict = (message: string, code?: string) =>
  new AppError(message, 409, code);

/**
 * Answers with an AppError's status, message and code. Controllers call this
 * first in a catch block, then fall back to their own handling for plain
 * Errors. `success` is for controllers whose responses carry that field.
 */
export function sendAppError(
  res: Response,
  err: AppError,
  opts: { success?: boolean } = {},
) {
  return res.status(err.status).json({
    ...(opts.success ? { success: false } : {}),
    message: err.message,
    code: err.code,
  });
}

/**
 * The tail of a controller catch block. An AppError answers with its own status
 * and message; anything else is unexpected, so it is logged and answered with a
 * generic 500 instead of echoing an internal message to the client.
 */
export function sendServerError(
  res: Response,
  err: unknown,
  opts: { success?: boolean } = {},
) {
  if (err instanceof AppError) return sendAppError(res, err, opts);
  console.error("Unhandled controller error:", err);
  return res.status(500).json({
    ...(opts.success ? { success: false } : {}),
    message: isDev
      ? (err as Error)?.message || "Something went wrong"
      : "Something went wrong",
    code: "INTERNAL",
  });
}
