import type { ErrorRequestHandler } from "express";
import { AppError, fromPrisma } from "../utils/errors";

/** An Error that carries an HTTP status for the global handler to honour. */
interface HttpError extends Error {
  status?: number;
  code?: string;
}

function toHttpError(err: unknown): HttpError {
  if (err instanceof Error) return err as HttpError;
  return new Error(
    typeof err === "string" ? err : "An unexpected error occurred",
  );
}

// Prisma errors the client can act on are mapped by `fromPrisma`
// (utils/errors.ts), shared with controllers that answer their own errors.

export function createErrorHandler(isDev: boolean): ErrorRequestHandler {
  return (err, _req, res, _next) => {
    const error: HttpError = fromPrisma(err) ?? toHttpError(err);
    console.error("❌ GLOBAL ERROR:", error.message);
    // Errors without a status are unexpected: don't leak their message.
    const status = error.status || 500;
    res.status(status).json({
      success: false,
      message:
        status >= 500 && !isDev
          ? "Something went wrong"
          : error.message || "An unexpected error occurred",
      // Only AppError codes are ours; a raw `code` (e.g. from Node) is not.
      code: error instanceof AppError ? error.code : undefined,
      stack: isDev ? error.stack : undefined,
    });
  };
}
