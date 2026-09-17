export type TransactionKind = "asset" | "service" | "venue";
export type TransactionAction = "confirm" | "reject" | "cancel" | "expire";

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

export class InvalidTransitionError extends Error {
  constructor(
    public readonly kind: TransactionKind,
    public readonly fromStatus: string,
    public readonly action: TransactionAction,
  ) {
    super(
      `Cannot ${action} a ${kind} transaction currently in status "${fromStatus}"`,
    );
    this.name = "InvalidTransitionError";
  }
}

export class TransactionActorUnauthorizedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TransactionActorUnauthorizedError";
  }
}

export class DeadlinePassedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DeadlinePassedError";
  }
}
