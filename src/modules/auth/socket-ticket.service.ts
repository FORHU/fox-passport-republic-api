import crypto from "crypto";
import redisUtil from "../../utils/redis.util";
import type { SystemRole } from "@prisma/client";

/**
 * Short-lived handshake credential for socket.io.
 *
 * The socket used to authenticate with the raw access token, read from the
 * client-side auth store. That store no longer holds one - tokens moved to
 * httpOnly cookies - so `SocketProvider` has been bailing out before it ever
 * connected, and the notification channel has been silently dead since.
 *
 * A cookie cannot fix it either: the access cookie belongs to the app's origin,
 * and the socket connects to the API's. So the app asks for a ticket over an
 * authenticated request it *can* make, and hands that to the handshake. Same
 * shape as the Google exchange code: opaque, single-use, and worthless a minute
 * later, so it is safe to pass through client JavaScript when a token is not.
 */

const PREFIX = "socket:ticket:";
const TTL_SECONDS = 60;

export interface SocketIdentity {
  userId: string;
  systemRole: SystemRole;
}

export async function issueSocketTicket(
  identity: SocketIdentity,
): Promise<string> {
  const client = redisUtil.getClient();
  if (!client) {
    throw new Error("Realtime updates are temporarily unavailable");
  }

  const ticket = crypto.randomBytes(32).toString("hex");
  await client.set(`${PREFIX}${ticket}`, JSON.stringify(identity), {
    EX: TTL_SECONDS,
  });
  return ticket;
}

/** Redeems a ticket exactly once - `getDel` is atomic, so a replay finds nothing. */
export async function redeemSocketTicket(
  ticket: string,
): Promise<SocketIdentity | null> {
  const client = redisUtil.getClient();
  if (!client) return null;

  const raw = await client.getDel(`${PREFIX}${ticket}`);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as SocketIdentity;
    return typeof parsed?.userId === "string" ? parsed : null;
  } catch {
    return null;
  }
}
