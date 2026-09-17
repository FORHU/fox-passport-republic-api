export class IdempotencyRequesterMismatchError extends Error {
  constructor() {
    super("This idempotency key was already used by a different requester");
    this.name = "IdempotencyRequesterMismatchError";
  }
}

export class IdempotencyPayloadMismatchError extends Error {
  constructor() {
    super(
      "This idempotency key was already used with a different request payload",
    );
    this.name = "IdempotencyPayloadMismatchError";
  }
}

export type ClaimResult =
  | { status: "claimed"; executionToken: string }
  | { status: "cached"; responseBody: unknown }
  | { status: "in_progress" };
