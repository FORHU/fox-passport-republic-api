/**
 * The names both sides of the socket agree on.
 *
 * Room and event names are the contract between this server and the browser:
 * the client listens for exactly these strings, and a typo in either place
 * fails silently — no error, no dropped connection, just a screen that never
 * updates. That is the hardest realtime bug to notice, so the strings live in
 * one place and are referenced, never retyped.
 *
 * The app mirrors these in `src/shared/lib/realtime.ts`.
 */

/**
 * Every connected admin.
 *
 * Approval queues are shared state — one approval changes what every admin
 * sees — so they get a room rather than N individual user rooms.
 */
export const ADMIN_ROOM = "role:admin";

/**
 * A user's private room, named by their id.
 *
 * The gateway joins it on connect and `emitToUser` addresses it; naming the
 * convention here keeps those two in step and gives the room scheme one place
 * to change if it ever needs a prefix.
 */
export const userRoom = (userId: string): string => userId;

/** Events this server sends to clients. */
export const SOCKET_EVENTS = {
  /** A notification the user should see now. Carries the notification. */
  NEW_NOTIFICATION: "new_notification",
  /**
   * Something the client may be showing has changed. Carries a topic and
   * nothing else — the client refetches through the same endpoint it always
   * did, so the socket payload and the REST response can never disagree.
   */
  DATA_INVALIDATE: "data:invalidate",
  /**
   * A direct message. Carries the message itself, unlike DATA_INVALIDATE —
   * there is no "refetch just the new one" endpoint for a chat, so the
   * payload has to travel with the event. Not yet folded into the topic
   * system; do that only if a REST fetch keyed on conversation id exists to
   * refetch from.
   */
  NEW_MESSAGE: "new_message",
  /**
   * A message was deleted (by its sender) — carries just enough to remove it
   * from a message list already held client-side, same reasoning as
   * NEW_MESSAGE (no per-message REST fetch to refetch from).
   */
  MESSAGE_DELETED: "message_deleted",
  /** A message's reaction list changed — carries the full up-to-date list
   * for that message (small, at most one per participant). */
  MESSAGE_REACTION: "message_reaction",
  /** Someone is typing in a conversation right now — client-emitted
   * ("typing", see socket.gateway.ts), relayed here to the other
   * participant. Not persisted; purely transient. */
  TYPING: "typing",
  /** A user's online/offline status changed — scoped to their conversation
   * partners only (see ConversationRepository.getPartnerIds), not broadcast
   * to everyone connected. */
  PRESENCE_UPDATE: "presence:update",
  /** Sent only to the person just removed from a group by its creator —
   * everyone else just gets the system-message notice + DATA_INVALIDATE,
   * but the removed person needs their own open window closed client-side
   * even though they can no longer poll that conversation for updates. */
  GROUP_REMOVED: "group:removed",
  /** A message's content changed — carries the full updated message, same
   * reasoning as NEW_MESSAGE. */
  MESSAGE_EDITED: "message_edited",
  /** Someone read up to "now" in a conversation — carries just the reader
   * and the new cursor, so a group's "Seen by ..." line can update live
   * without a REST refetch (see ConversationRead). */
  READ_RECEIPT: "read:receipt",
} as const;

export type SocketEvent = (typeof SOCKET_EVENTS)[keyof typeof SOCKET_EVENTS];
