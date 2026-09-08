import { Response } from "express";
import { isDev, refreshTokenTtlMs } from "../../config";

/**
 * The single definition of session cookie policy.
 *
 * These used to be composed by the Next app, which meant the browser's
 * credential lifetime was set by a hand-copied constant in another repository -
 * written out three times, each commented "must match REFRESH_TOKEN_EXPIRY",
 * a value that lives here. They drifted once already: the access cookie lived
 * seven days while the JWT inside it expired in fifteen minutes, so the browser
 * kept presenting a credential the server had stopped honouring.
 *
 * Lifetime is derived from `refreshTokenTtlMs`, the same function that sets the
 * refresh token's own expiry, so the cookie and the token it carries cannot
 * disagree.
 *
 * **No `domain` attribute, deliberately.** The browser never talks to this API
 * directly - it talks to the Next app, whose proxy relays these headers onward.
 * A host-only cookie binds to whoever relayed it, which is what lets the
 * browser file these against the app's own origin whatever it happens to be.
 * Naming a domain here would name *this* host, and the browser would refuse the
 * cookie when it arrived from the app's. If a direct browser-to-API call is ever
 * introduced, this assumption is the first thing that breaks.
 */

export const ACCESS_COOKIE = "fox_token";
export const REFRESH_COOKIE = "fox_refresh_token";
export const USER_COOKIE = "fox_user";

interface SessionCookiePayload {
  accessToken: string;
  refreshToken?: string;
  /**
   * Serialised as-is. Deliberately not narrowed to a named user shape: this
   * module has no opinion on what the profile contains, and the login, refresh
   * and Google-exchange paths each build theirs separately. Narrowing here
   * would only force a cast at whichever call site drifted first.
   */
  user?: Record<string, unknown>;
}

/**
 * `secure` is off in development because local development is http://. Every
 * other attribute is identical in both, so what is exercised locally is what
 * runs in production.
 */
function baseOptions() {
  return {
    secure: !isDev,
    sameSite: "lax" as const,
    path: "/",
  };
}

/**
 * Written on every path that begins or extends a session: login, refresh, and
 * the Google exchange.
 *
 * The token cookies are httpOnly, so page JavaScript cannot read them - that is
 * the whole point of the arrangement. `fox_user` is not, and carries profile
 * data and no token: the Next app reads it server-side when this API is
 * unreachable, so a backend blip does not sign everyone out, and the client
 * reads it to paint a signed-in header before the first request settles. It is
 * display data, never proof of anything.
 */
export function setSessionCookies(
  res: Response,
  { accessToken, refreshToken, user }: SessionCookiePayload,
): void {
  const maxAge = refreshTokenTtlMs();

  res.cookie(ACCESS_COOKIE, accessToken, {
    ...baseOptions(),
    httpOnly: true,
    maxAge,
  });

  // Absent only if a caller ever stops rotating. Guarded rather than assumed,
  // because writing `undefined` here would clear the cookie and end the session
  // at the next refresh.
  if (refreshToken) {
    res.cookie(REFRESH_COOKIE, refreshToken, {
      ...baseOptions(),
      httpOnly: true,
      maxAge,
    });
  }

  if (user) {
    // Express encodes cookie values with encodeURIComponent, which is what the
    // app decodes with on both sides. JSON's quotes and commas would otherwise
    // truncate the value at the first delimiter.
    res.cookie(USER_COOKIE, JSON.stringify(user), {
      ...baseOptions(),
      maxAge,
    });
  }
}

/**
 * Attributes must match what `setSessionCookies` wrote or the browser keeps the
 * originals: a clear is only a `Set-Cookie` with an expiry in the past, and it
 * is matched on name, path and domain rather than on intent.
 */
export function clearSessionCookies(res: Response): void {
  const options = baseOptions();
  res.clearCookie(ACCESS_COOKIE, { ...options, httpOnly: true });
  res.clearCookie(REFRESH_COOKIE, { ...options, httpOnly: true });
  res.clearCookie(USER_COOKIE, options);
}
