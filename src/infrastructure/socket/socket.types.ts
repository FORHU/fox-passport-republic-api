export interface NotificationPayload {
  id: string;
  type: string;
  message: string;
  isRead: boolean;
  metadata?: Record<string, unknown> | null;
  createdAt: Date;
}
export interface ServerToClientEvents {
  new_notification: (payload: NotificationPayload) => void;
}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface ClientToServerEvents {
  // Define any events that the client can send to the server here
}
