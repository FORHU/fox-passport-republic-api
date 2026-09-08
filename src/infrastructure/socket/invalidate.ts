import { io } from "./socket.server";
import { emitInvalidateToAdmins, emitInvalidateToUser } from "./socket.utils";
import type { InvalidateTopic } from "./socket.types";

/**
 * One-line announcements for call sites that have just changed shared state.
 *
 * Wraps the `io` import so a controller does not have to reach into the socket
 * infrastructure to say "this changed", and so a socket failure can never take
 * down the request that succeeded - the write already happened; telling people
 * about it is best-effort by definition.
 */

/**
 * Something every admin may be looking at just changed.
 *
 * The topic is a parameter because the admin console is not one screen: the
 * approval queues read `admin:pending`, the disputes tables read `disputes`,
 * and an invalidation aimed at the wrong one is indistinguishable from no
 * invalidation at all.
 */
export function announceToAdmins(topic: InvalidateTopic): void {
  try {
    emitInvalidateToAdmins(io, topic);
  } catch {
    // Best-effort: clients still hold a slow poll and a focus refetch.
  }
}

/** Every admin's approval queue just changed. */
export function announceAdminQueueChanged(): void {
  announceToAdmins("admin:pending");
}

/** Something this one user is looking at just changed. */
export function announceToUser(
  userId: string | null | undefined,
  topic: InvalidateTopic,
): void {
  if (!userId) return;
  try {
    emitInvalidateToUser(io, userId, topic);
  } catch {
    // As above.
  }
}
