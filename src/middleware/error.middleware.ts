import type { ErrorRequestHandler, Request } from "express";
import multer from "multer";
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

// A refused upload is the person's to fix. Multer's own text names its internals
// ("File too large", "Unexpected field"), so each code gets a sentence here.
const UPLOAD_ERRORS: Record<string, { status: number; message: string }> = {
  LIMIT_FILE_SIZE: {
    status: 413,
    message: "That file is too large. Choose a smaller one and try again.",
  },
  LIMIT_FILE_COUNT: {
    status: 400,
    message: "Too many files. Remove some and try again.",
  },
};

function fromMulter(err: unknown): AppError | null {
  if (!(err instanceof multer.MulterError)) return null;
  const known = UPLOAD_ERRORS[err.code];
  return known
    ? new AppError(known.message, known.status, err.code)
    : new AppError("That upload couldn't be read. Try again.", 400, err.code);
}

// Prisma errors the client can act on are mapped by `fromPrisma`
// (utils/errors.ts), shared with controllers that answer their own errors.

/**
 * The technical record of a failed request, for the server log only: what was
 * asked, who asked, and the stack. None of it goes into the response.
 */
export function logRequestError(
  req: Partial<Request>,
  error: HttpError,
  status: number,
) {
  console.error("❌ GLOBAL ERROR:", {
    status,
    method: req.method,
    path: req.originalUrl ?? req.url,
    userId: (req as Request).user?.userId,
    message: error.message,
    code: error.code,
    stack: error.stack,
  });
}

export function createErrorHandler(isDev: boolean): ErrorRequestHandler {
  return (err, req, res, _next) => {
    const error: HttpError =
      fromMulter(err) ?? fromPrisma(err) ?? toHttpError(err);
    // Errors without a status are unexpected: don't leak their message.
    const status = error.status || 500;
    logRequestError(req, toHttpError(err), status);
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
