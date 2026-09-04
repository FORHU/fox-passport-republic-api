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
} as const;

export type SocketEvent = (typeof SOCKET_EVENTS)[keyof typeof SOCKET_EVENTS];
