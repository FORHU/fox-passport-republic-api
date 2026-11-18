import { AppError } from "../../utils/errors";

export type TransactionKind = "asset" | "service" | "venue";
export type TransactionAction =
  "confirm" | "reject" | "cancel" | "expire" | "decline";

/**
 * Pure, unit-testable deadline comparison — deliberately separated from any
 * database or wall-clock access so deadline-boundary tests can use exact
 * fixed timestamps instead of racing real time. The DB-sourced "now" is
 * fetched once per transition call and passed in here; this function never
 * reads a clock itself.
 *
 * Inclusive: confirming at exactly the deadline succeeds.
 */
export function isWithinDeadline(now: Date, deadline: Date | null): boolean {
  if (deadline === null) return false; // fail closed — see the DB CHECK constraint this mirrors
  return now.getTime() <= deadline.getTime();
}

export class InvalidTransitionError extends AppError {
  constructor(
    public readonly kind: TransactionKind,
    public readonly fromStatus: string,
    public readonly action: TransactionAction,
  ) {
    super(
      `Cannot ${action} a ${kind} transaction currently in status "${fromStatus}"`,
      409,
      "INVALID_TRANSITION",
    );
  }
}

export class TransactionActorUnauthorizedError extends AppError {
  constructor(message: string) {
    super(message, 403);
  }
}

/**
 * A Supplier tried to decline a booking that has already been paid. After
 * payment a Supplier can only leave through the cancellation and refund
 * policy, so a paid citizen is not left without a Supplier on a Supplier's
 * whim (ADR 0010, decision 1).
 */
export class DeclineAfterPaymentError extends AppError {
  constructor() {
    super(
      "This booking is already paid, so it can no longer be declined. Use the cancellation policy instead.",
      409,
      "DECLINE_AFTER_PAYMENT",
    );
  }
}

export class DeadlinePassedError extends AppError {
  constructor(message: string) {
    super(message, 409, "DEADLINE_PASSED");
  }
}
