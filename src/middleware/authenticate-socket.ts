import jwt from "jsonwebtoken";
import { ObjectId } from "mongodb";
import { Socket } from "socket.io";

import { ACCESS_TOKEN_SECRET } from "../config";
import AuthSvc from "../services/auth.service";

interface AuthenticatedSocket extends Socket {
  user?: any;
}

// eslint-disable-next-line no-unused-vars
const authenticateSocket = async (socket: AuthenticatedSocket, next: (err?: Error) => void) => {
  const authHeader = socket.handshake.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    return next(new Error("Authentication token is required."));
  }

  try {
    const user: any = jwt.verify(token, ACCESS_TOKEN_SECRET);
    const userId = user._id;

    const userData = await AuthSvc.getAuthUsers({ user: new ObjectId(userId) });
    if (!userData || userData.status !== "ACTIVE") {
      return next(new Error("User not found or status is inactive"));
    }

    socket.user = user;
    next();
  } catch (error) {
    return next(new Error("Invalid token"));
  }
};

export default authenticateSocket;
