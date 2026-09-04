import { Server } from "socket.io";
import { InvalidateTopic } from "./socket.types";
import { ADMIN_ROOM, SOCKET_EVENTS, userRoom } from "./socket.constants";

/**
 * `io` is assigned only by `initSocketServer`, which only `server.ts` calls, so
 * any entry point that imports `app` on its own has none. Callers pass it in
 * from a module-level `let`, which TypeScript types as always present and which
 * is `undefined` in exactly that case - so the guard is a runtime one the type
 * cannot express. Not being able to announce something is never a reason to
 * fail the write that already happened.
 *
 * Generic over the payload rather than fixed to `NotificationPayload`: this
 * now also carries chat messages (see SOCKET_EVENTS.NEW_MESSAGE), which have
 * no relation to a notification's shape. Each call site still gets the
 * type-checking of whatever it passes in.
 */
export const emitToUser = <T>(
  io: Server | undefined,
  userId: string,
  event: string,
  payload: T,
) => {
  if (!io) return;
  io.to(userRoom(userId)).emit(event, payload);
};

/**
 * Tells a client that a topic it may be showing has changed, so it can refetch
 * once instead of asking every few seconds whether anything happened.
 *
 * Deliberately carries no data. Sending the changed row would mean the socket
 * payload and the REST response could disagree, and every emit site would have
 * to know the shape each screen wants. An invalidation is a hint; the client
 * still fetches through the same endpoint it always did.
 */
export const emitInvalidateToUser = (
  io: Server,
  userId: string,
  topic: InvalidateTopic,
) => {
  io.to(userRoom(userId)).emit(SOCKET_EVENTS.DATA_INVALIDATE, { topic });
};

export const emitInvalidateToAdmins = (io: Server, topic: InvalidateTopic) => {
  io.to(ADMIN_ROOM).emit(SOCKET_EVENTS.DATA_INVALIDATE, { topic });
};
