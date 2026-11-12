import crypto from "crypto";
import redisUtil from "../../utils/redis.util";
import { AppError } from "../../utils/errors";

/**
 * The OAuth `state` for the Facebook Page permission dialog. Meta hands it back
 * on the callback, which has no FoxPassport session of its own (the browser
 * arrives at the API's origin, not the app's), so the state is what says whose
 * connection this is. Opaque, single-use and short-lived, the same shape as the
 * socket ticket (auth/socket-ticket.service.ts): a forged or replayed callback
 * finds nothing.
 */

const PREFIX = "facebook:oauth-state:";
const TTL_SECONDS = 10 * 60;

export async function issueFacebookOAuthState(userId: string): Promise<string> {
  const client = redisUtil.getClient();
  if (!client) {
    throw new AppError(
      "Connecting Facebook is temporarily unavailable. Try again in a moment.",
      503,
      "FACEBOOK_STATE_UNAVAILABLE",
    );
  }
  const state = crypto.randomBytes(32).toString("hex");
  await client.set(`${PREFIX}${state}`, JSON.stringify({ userId }), {
    EX: TTL_SECONDS,
  });
  return state;
}

/** The user the state was issued to, exactly once; null if unknown or used. */
export async function redeemFacebookOAuthState(
  state: string,
): Promise<string | null> {
  if (!/^[0-9a-f]{64}$/.test(state)) return null;
  const client = redisUtil.getClient();
  if (!client) return null;

  const raw = await client.getDel(`${PREFIX}${state}`);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { userId?: unknown };
    return typeof parsed.userId === "string" ? parsed.userId : null;
  } catch {
    return null;
  }
}
