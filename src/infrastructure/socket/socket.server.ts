import { Server } from "socket.io";
import { Server as HttpServer } from "http";
import { CORS_ORIGINS, FRONTEND_URL } from "../../config";

export let io: Server;

export const initSocketServer = (httpServer: HttpServer) => {
  io = new Server(httpServer, {
    cors: {
      origin: CORS_ORIGINS.length ? CORS_ORIGINS : [FRONTEND_URL],
      methods: ["GET", "POST"],
      credentials: true,
    },
  });
  return io;
};
