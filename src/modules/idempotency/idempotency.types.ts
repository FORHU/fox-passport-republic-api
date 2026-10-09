import { AppError } from "../../utils/errors";

export class IdempotencyRequesterMismatchError extends AppError {
  constructor() {
    super(
      "This idempotency key was already used by a different requester",
      403,
      "IDEMPOTENCY_KEY_FORBIDDEN",
    );
  }
}

export class IdempotencyPayloadMismatchError extends AppError {
  constructor() {
    super(
      "This idempotency key was already used with a different request payload",
      422,
      "IDEMPOTENCY_KEY_REUSED",
    );
  }
}

export type ClaimResult =
  | { status: "claimed"; executionToken: string }
  | { status: "cached"; responseBody: unknown }
  | { status: "in_progress" };
