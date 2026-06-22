import { Server, Socket } from "socket.io";
import jwt from "jsonwebtoken";
import { ACCESS_TOKEN_SECRET} from "../../config";

interface AuthenticatedSocket extends Socket {
  userId?: string;
}

export const registerSocketGateway = (io: Server) => {
  // Middleware: verify JWT before allowing connection
  io.use((socket: AuthenticatedSocket, next) => {
    const token = socket.handshake.auth?.token;

    if (!token) {
      return next(new Error("Authentication token missing"));
    }

    try {
      const decoded = jwt.verify(token, ACCESS_TOKEN_SECRET) as { userId: string };
      socket.userId = decoded.userId;
      next();
    } catch (err) {
      next(new Error("Invalid or expired token"));
    }
  });

  io.on("connection", (socket: AuthenticatedSocket) => {
    console.log(`🔌 Socket connected: ${socket.id} (user: ${socket.userId})`);

    if (socket.userId) {
      // Put this user in their own private room
      socket.join(socket.userId);
    }

    socket.on("disconnect", () => {
      console.log(`❌ Socket disconnected: ${socket.id}`);
    });
  });
};