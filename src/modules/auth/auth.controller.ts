import { Request, Response } from "express";
import { issueSocketTicket } from "./socket-ticket.service";

/**
 * Sign-in, sign-up, email codes, social sign-in and sign-out are Better Auth's
 * (`infrastructure/auth/better-auth.ts`, mounted in app.ts). What stays here is
 * ours: the single-use ticket the realtime socket handshake redeems.
 */
export default class AuthCtrl {
  static async socketTicket(req: Request, res: Response) {
    if (!req.user) {
      return res.status(401).json({ message: "Not authenticated" });
    }

    try {
      const ticket = await issueSocketTicket({
        userId: req.user.userId,
        systemRole: req.user.systemRole,
      });
      return res.status(200).json({ data: { ticket } });
    } catch {
      return res
        .status(503)
        .json({ message: "Realtime updates are temporarily unavailable" });
    }
  }
}
