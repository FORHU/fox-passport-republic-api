import { Server } from "socket.io";
import { NotificationPayload } from "./socket.types";

export const emitToUser = (
  io: Server,
  userId: string,
  event: string,
  payload: NotificationPayload,
) => {
  io.to(userId).emit(event, payload);
};
