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
