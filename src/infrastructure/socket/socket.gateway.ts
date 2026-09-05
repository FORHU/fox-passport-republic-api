import { Server, Socket } from "socket.io";
import jwt from "jsonwebtoken";
import { ACCESS_TOKEN_SECRET } from "../../config";
import { redeemSocketTicket } from "../../modules/auth/socket-ticket.service";
import { ADMIN_ROOM, userRoom } from "./socket.constants";
import type { SystemRole } from "@prisma/client";
import { can } from "../../types/permissions";

interface AuthenticatedSocket extends Socket {
  userId?: string;
  systemRole?: SystemRole;
}

export const registerSocketGateway = (io: Server) => {
  /**
   * Two ways in, in priority order.
   *
   * A **ticket** is what browsers use. The access token is httpOnly and cannot
   * reach client JavaScript, so the app trades its cookie for a one-minute,
   * single-use ticket over HTTP and presents that here. This is the path that
   * makes the socket work at all again - the token path below has been failing
   * silently since tokens left localStorage.
   *
   * A raw **token** still works for any non-browser client that legitimately
   * holds one. It is not the browser's route in.
   */
  io.use(async (socket: AuthenticatedSocket, next) => {
    const rawTicket = socket.handshake.auth?.ticket;

    if (rawTicket) {
      const identity = await redeemSocketTicket(String(rawTicket));
      if (!identity) {
        return next(new Error("Invalid or expired socket ticket"));
      }
      socket.userId = identity.userId;
      socket.systemRole = identity.systemRole;
      return next();
    }

    const rawToken = socket.handshake.auth?.token;
    if (!rawToken) {
      return next(new Error("Authentication ticket missing"));
    }

    // Mirror the HTTP auth middleware: strip "Bearer " prefix and any accidental quotes
    const token = String(rawToken)
      .replace(/^Bearer\s+/i, "")
      .replace(/"/g, "");

    try {
      const decoded = jwt.verify(token, ACCESS_TOKEN_SECRET) as {
        userId: string;
        systemRole?: SystemRole;
      };
      socket.userId = decoded.userId;
      socket.systemRole = decoded.systemRole;
      return next();
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (err) {
      return next(new Error("Invalid or expired token"));
    }
  });

  io.on("connection", (socket: AuthenticatedSocket) => {
    console.log(`🔌 Socket connected: ${socket.id} (user: ${socket.userId})`);

    if (socket.userId) {
      // Private room, named by user id. `emitToUser` has always addressed this.
      socket.join(userRoom(socket.userId));
    }

    // Admin queues are shared state: one approval changes what every admin
    // sees, so they need a room of their own rather than N user rooms.
    if (can(socket.systemRole, "queue:read")) {
      socket.join(ADMIN_ROOM);
    }

    socket.on("disconnect", () => {
      console.log(`❌ Socket disconnected: ${socket.id}`);
    });
  });
};
