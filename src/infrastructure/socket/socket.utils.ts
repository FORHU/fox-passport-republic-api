import { Server } from "socket.io";

export const emitToUser = (
  io: Server,
  userId: string,
  event: string,
  payload: unknown,
) => {
  io.to(userId).emit(event, payload);
};
