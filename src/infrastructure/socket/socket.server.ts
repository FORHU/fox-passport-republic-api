import { Server } from "socket.io";
import { Server as HttpServer } from "http";
import { FRONTEND_URL } from "../../config";

export let io: Server;

export const initSocketServer = (httpServer: HttpServer) => {
  io = new Server(httpServer, {
    cors: {
      origin: FRONTEND_URL.split(",").map((url) => url.trim()),
      methods: ["GET", "POST"],
      credentials: true,
    },
  });
  return io;
};
