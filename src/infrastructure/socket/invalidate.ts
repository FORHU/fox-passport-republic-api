import { io } from "./socket.server";
import { SOCKET_EVENTS } from "./socket.constants";
import {
  emitInvalidateToAdmins,
  emitInvalidateToUser,
  emitToAll,
} from "./socket.utils";
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

/**
 * A post's comment count is now [commentsCount]. Goes to everyone connected:
 * the feed is public, so anyone may have the post on screen.
 */
export function announcePostCommentsCount(
  postId: string,
  commentsCount: number,
): void {
  try {
    emitToAll(io, SOCKET_EVENTS.POST_COMMENTS_COUNT, { postId, commentsCount });
  } catch {
    // As above.
  }
}

/**
 * A public post was just created on [tab] by [authorId]. Goes to everyone
 * connected, so it carries no post id or content; callers send it for public
 * posts only. The author is already public on the post itself; it lets an
 * open profile of theirs refetch (api#427).
 */
export function announceNewPost(tab: string, authorId: string): void {
  try {
    emitToAll(io, SOCKET_EVENTS.FEED_NEW, { tab, authorId });
  } catch {
    // As above.
  }
}

/**
 * A post's reaction count is now [likesCount]. Goes to everyone connected,
 * so callers send it for public posts only, and it never says who reacted.
 */
export function announcePostReactionsCount(
  postId: string,
  likesCount: number,
): void {
  try {
    emitToAll(io, SOCKET_EVENTS.POST_REACTIONS_COUNT, { postId, likesCount });
  } catch {
    // As above.
  }
}

/** A comment's reaction count is now [likesCount]. Public posts only. */
export function announceCommentReactionsCount(
  postId: string,
  commentId: string,
  likesCount: number,
): void {
  try {
    emitToAll(io, SOCKET_EVENTS.COMMENT_REACTIONS_COUNT, {
      postId,
      commentId,
      likesCount,
    });
  } catch {
    // As above.
  }
}
