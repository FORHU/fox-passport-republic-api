import type { ErrorRequestHandler } from "express";
import { Prisma } from "@prisma/client";
import { AppError } from "../utils/errors";

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

/**
 * Prisma errors the client can act on, mapped once here instead of in every
 * service. The messages are fixed: Prisma's own text names tables and columns.
 */
function fromPrisma(err: unknown): AppError | null {
  if (!(err instanceof Prisma.PrismaClientKnownRequestError)) return null;
  switch (err.code) {
    case "P2025": // record required for the operation does not exist
      return new AppError("Record not found", 404);
    case "P2002": // unique constraint
      return new AppError("This record already exists", 409);
    case "P2003": // foreign key constraint
      return new AppError(
        "This record is linked to, or refers to, another that does not allow it",
        409,
      );
    default:
      return null;
  }
}

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
