import { SOCKET_EVENTS } from "./socket.constants";

export interface NotificationPayload {
  id: string;
  type: string;
  message: string;
  isRead: boolean;
  metadata?: Record<string, unknown> | null;
  createdAt: Date;
}
/**
 * What a client may be showing that the server can invalidate. Kept as a closed
 * union so a typo on the server cannot silently emit a topic nothing listens
 * for - the failure would otherwise look exactly like "the socket is down".
 */
export type InvalidateTopic =
  | "admin:pending"
  | "venues"
  | "events"
  | "bookings"
  // The admin disputes and refunds tables. Separate from `bookings` because
  // they read `/admin/disputes`, which no booking invalidation touches.
  | "disputes"
  | "waitlist"
  | "roles";

export interface InvalidatePayload {
  topic: InvalidateTopic;
}

export interface ServerToClientEvents {
  [SOCKET_EVENTS.NEW_NOTIFICATION]: (payload: NotificationPayload) => void;
  [SOCKET_EVENTS.DATA_INVALIDATE]: (payload: InvalidatePayload) => void;
}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface ClientToServerEvents {
  // Define any events that the client can send to the server here
}
