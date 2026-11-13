import * as dotenv from "dotenv";
import { requireSecret } from "./utils/require-secret";
import { readPercentEnv } from "./utils/percent-env";
dotenv.config();

export const DATABASE_URL = process.env.DATABASE_URL as string;
export const PORT = Number(process.env.PORT || 6002);
// Single base URL, used to build links in emails. Never a list - if a
// comma-separated value is supplied we take the first entry, because
// `${FRONTEND_URL}/dashboard` on a list produces a broken link.
export const FRONTEND_URL = (
  process.env.FRONTEND_URL ||
  process.env.CORS_ORIGIN ||
  "http://localhost:6001"
)
  .split(",")[0]
  .trim();

// Comma-separated allow-list for CORS and socket.io. Separate from
// FRONTEND_URL because an allow-list and a link base are different things.
export const CORS_ORIGINS = (
  process.env.CORS_ORIGIN ||
  process.env.FRONTEND_URL ||
  ""
)
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);
export const SECRET_KEY = process.env.SECRET_KEY as string;
export const isDev = process.env.NODE_ENV !== "production";
export const MAILER_TRANSPORT_HOST = process.env
  .MAILER_TRANSPORT_HOST as string;
export const MAILER_TRANSPORT_PORT = Number(
  process.env.MAILER_TRANSPORT_PORT || 465,
);
export const MAILER_TRANSPORT_SECURE =
  process.env.MAILER_TRANSPORT_SECURE === "true";
export const MAILER_EMAIL = process.env.MAILER_EMAIL as string;
export const MAILER_PASSWORD = process.env.MAILER_PASSWORD as string;
export const BETTER_AUTH_SECRET = requireSecret(
  "BETTER_AUTH_SECRET",
  process.env.BETTER_AUTH_SECRET,
  { isDev },
);
export const BETTER_AUTH_URL =
  process.env.BETTER_AUTH_URL || `http://localhost:${PORT}`;

/*
 * Redis configuration is deliberately NOT here. Four `REDIS_*` constants used
 * to sit in this file with nothing reading them - `redis.util` read
 * `process.env` itself - which is how their defaults came to disagree, and how
 * `REDIS_TTL_SECONDS` came to look like a live knob when no TTL has ever come
 * from it. They live in `utils/redis.util.ts` now, next to the client they
 * configure.
 *
 * Importing this module from there was the other option and is worse: this file
 * runs `dotenv.config()` and validates the token secrets at import time, and
 * `redis.util` is a leaf that `otp.utils` and `cache.util` both pull in. A test
 * caught it immediately - dotenv calls `Math.random()` for a promotional tip,
 * and `auth.otp.spec` asserts that generating an OTP touches no such thing.
 */
export const SERVICE_ACCOUNT = process.env.SERVICE_ACCOUNT as string;
// Public CDN in front of the media bucket (deployed environments).
export const S3_CDN_URL = process.env.S3_CDN_URL as string | undefined;
// Static AWS keys: only for local MinIO or running off AWS. Leave both unset
// on an AWS host — the instance role grants S3 (see utils/s3.ts).
export const AWS_ACCESS_KEY = process.env.AWS_ACCESS_KEY as string | undefined;
export const AWS_SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY as
  string | undefined;
export const AWS_S3_BUCKET = process.env.AWS_S3_BUCKET as string;
export const AWS_REGION = process.env.AWS_REGION as string;
// Set to point the S3 client at an S3-compatible service (e.g. local MinIO)
// instead of real AWS. MinIO needs forcePathStyle since it doesn't do
// virtual-hosted-style bucket URLs by default.
export const S3_ENDPOINT = process.env.S3_ENDPOINT as string | undefined;
export const S3_FORCE_PATH_STYLE = process.env.S3_FORCE_PATH_STYLE === "true";
export const CLOUD_FRONT_DOMAIN = process.env.CLOUD_FRONT_DOMAIN as
  string | undefined;
// Videos live in real AWS S3, never in the local MinIO the photos may use.
// Set AWS_S3_VIDEO_BUCKET to give them a bucket of their own. Where
// S3_ENDPOINT is unset (a deployed AWS host) they default to AWS_S3_BUCKET;
// where it is set (local MinIO) they are refused until this is configured.
export const AWS_S3_VIDEO_BUCKET = process.env.AWS_S3_VIDEO_BUCKET as
  string | undefined;
export const AWS_VIDEO_REGION = process.env.AWS_VIDEO_REGION as
  string | undefined;
// Static keys for the video bucket, for a laptop without an AWS profile. Both
// or neither: on an AWS host the instance role is used.
export const AWS_VIDEO_ACCESS_KEY = process.env.AWS_VIDEO_ACCESS_KEY as
  string | undefined;
export const AWS_VIDEO_SECRET_ACCESS_KEY = process.env
  .AWS_VIDEO_SECRET_ACCESS_KEY as string | undefined;
// Public CDN in front of the video bucket. Without it a video's link is the
// bucket's own address, which needs the bucket's videos to be publicly
// readable.
export const VIDEO_CDN_URL = process.env.VIDEO_CDN_URL as string | undefined;
// Every uploaded video is checked and re-encoded on the server (src/utils/video.ts).
export const VIDEO_MAX_SECONDS = Number(process.env.VIDEO_MAX_SECONDS) || 30;
// A stored video should come out near 3MB; past this it is encoded again smaller.
export const VIDEO_MAX_OUTPUT_BYTES =
  Number(process.env.VIDEO_MAX_OUTPUT_BYTES) || 4 * 1024 * 1024;
// How many encodes run at once on one server; the rest wait their turn.
export const VIDEO_TRANSCODE_CONCURRENCY =
  Number(process.env.VIDEO_TRANSCODE_CONCURRENCY) || 2;
export const VIDEO_TRANSCODE_TIMEOUT_MS =
  Number(process.env.VIDEO_TRANSCODE_TIMEOUT_MS) || 120_000;
// The ffmpeg tools; found on the PATH unless these say where they are.
export const FFMPEG_PATH = process.env.FFMPEG_PATH || "ffmpeg";
export const FFPROBE_PATH = process.env.FFPROBE_PATH || "ffprobe";
// A bucket with no public access and no CDN in front of it, for identity
// documents (government IDs, clearances, proof of funds). Read only through
// short-lived presigned links. Falls back to AWS_S3_BUCKET when unset, which
// keeps local setups working but is not private — set it everywhere real.
export const AWS_S3_PRIVATE_BUCKET = process.env.AWS_S3_PRIVATE_BUCKET as
  string | undefined;

// Amazon SQS Queues (replaces RabbitMQ for async event/job processing)
export const AWS_SQS_PAYMENT_QUEUE_URL = process.env
  .AWS_SQS_PAYMENT_QUEUE_URL as string | undefined;
export const AWS_SQS_NOTIFICATION_QUEUE_URL = process.env
  .AWS_SQS_NOTIFICATION_QUEUE_URL as string | undefined;
export const SQS_ENDPOINT = process.env.SQS_ENDPOINT as string | undefined;

export const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY as string;
export const STRIPE_WEBHOOK_SECRET = process.env
  .STRIPE_WEBHOOK_SECRET as string;
// Platform's own cut, applied on top of itemsTotal (+ hostMarkup for Event bookings),
// never carved out of provider/host shares. See docs/adr/0002-stripe-connect-payouts.md.
// Checked at startup like PROCESSING_FEE_PERCENT: unset or empty still means 5,
// but "5%" or 300 now stops the API instead of charging NaN or 300%.
/**
 * A whole number setting read from the environment: unset or empty means the
 * fallback; anything else must be a whole number from 0 up, or the API stops.
 */
function readCountEnv(name: string, fallback: number): number {
  const value = process.env[name];
  if (value === undefined || value.trim() === "") return fallback;
  const parsed = Number(value.trim());
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(
      `${name} is "${value}". Refusing to start: it must be a whole number from 0 up.`,
    );
  }
  return parsed;
}

// Foxer leaderboard, Top rated (rewards spec section 7.2). Paws are ranked by
// the Bayesian average (v x R + p x C) / (v + p); p is the prior. A Foxer needs
// this many completed bookings to appear. Read from the environment until the
// admin settings screens exist (RR-8).
export const LEADERBOARD_PAWS_PRIOR = readCountEnv("LEADERBOARD_PAWS_PRIOR", 5);
export const LEADERBOARD_TOP_RATED_MIN_BOOKINGS = readCountEnv(
  "LEADERBOARD_TOP_RATED_MIN_BOOKINGS",
  3,
);

// Daily login (RR-7, rewards spec section 3): the most Tokens it pays in one
// Manila month, so it stops there. The amount paid each day lives in the
// `daily_login` RewardRule. Read from the environment until the admin settings
// screens exist (RR-8).
export const DAILY_LOGIN_MONTHLY_CAP_TOKENS = readCountEnv(
  "DAILY_LOGIN_MONTHLY_CAP_TOKENS",
  100,
);
// Daily login runs in a 7-day cycle: day 1 pays the rule's amount, and each
// later day pays this many Tokens more than the day before (15, 25, ... 75 with
// a rule of 15). 0 pays the same every day.
export const DAILY_LOGIN_STEP_TOKENS = readCountEnv(
  "DAILY_LOGIN_STEP_TOKENS",
  10,
);

// Milestones (RR-6): the moment tier Tokens start paying. A tier a citizen had
// already reached before this instant gives a badge only and never pays Tokens
// (no back-pay), so every existing citizen starts from where they stand.
// Unset means milestone Tokens do not pay at all. Set it to the deploy time, as
// an ISO instant such as 2026-11-20T00:00:00+08:00.
function readInstantEnv(name: string): Date | null {
  const value = process.env[name];
  if (value === undefined || value.trim() === "") return null;
  const parsed = new Date(value.trim());
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(
      `${name} is "${value}". Refusing to start: it must be an ISO date and time, for example 2026-11-20T00:00:00+08:00.`,
    );
  }
  return parsed;
}
export const MILESTONES_LAUNCH_AT = readInstantEnv("MILESTONES_LAUNCH_AT");

export const PLATFORM_FEE_PERCENT = readPercentEnv(
  "PLATFORM_FEE_PERCENT",
  process.env.PLATFORM_FEE_PERCENT,
  5,
);
// The processing fee added on top of each Foxer's price on an Event, in
// percent (3 = 3%). It pays Stripe's charge on the client's payment, so it is
// never paid out to anyone. One rate for every category. Event pricing only;
// direct asset/service/venue bookings don't charge it. See #264 and the
// library plan event-payment-breakdown-plan.md (D7).
export const PROCESSING_FEE_PERCENT = readPercentEnv(
  "PROCESSING_FEE_PERCENT",
  process.env.PROCESSING_FEE_PERCENT,
  3,
);
// Where Stripe-hosted Express onboarding sends the provider back to:
// `return` once they finish, `refresh` when the single-use link has expired and
// a new one must be minted. Both are passed to `stripe.accountLinks.create`,
// which rejects a missing or non-absolute URL - so these default off
// FRONTEND_URL rather than being cast from a possibly-unset env var, which
// previously reached Stripe as `undefined` and failed onboarding outright.
export const STRIPE_CONNECT_RETURN_URL =
  process.env.STRIPE_CONNECT_RETURN_URL ||
  `${FRONTEND_URL}/creator-dashboard/stripe-dashboard`;
export const STRIPE_CONNECT_REFRESH_URL =
  process.env.STRIPE_CONNECT_REFRESH_URL ||
  `${FRONTEND_URL}/creator-dashboard/stripe-onboard`;
export const RESEND_API_KEY = process.env.RESEND_API_KEY as string;

// Google sign-in is optional, but a partially configured integration must fail
// at boot instead of waiting until the first user clicks the button.
const googleClientId = process.env.GOOGLE_CLIENT_ID?.trim() || undefined;
const googleClientSecret =
  process.env.GOOGLE_CLIENT_SECRET?.trim() || undefined;

if (Boolean(googleClientId) !== Boolean(googleClientSecret)) {
  throw new Error(
    "GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be provided together.",
  );
}

export const GOOGLE_CLIENT_ID = googleClientId;
export const GOOGLE_CLIENT_SECRET = googleClientSecret;
if (!GOOGLE_CLIENT_ID) {
  console.warn(
    "⚠️  GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET are not set — Google sign-in will fail.",
  );
}

// Meta / Facebook sign-in configuration
const facebookAppId = process.env.FACEBOOK_APP_ID?.trim() || undefined;
const facebookAppSecret = process.env.FACEBOOK_APP_SECRET?.trim() || undefined;

if (Boolean(facebookAppId) !== Boolean(facebookAppSecret)) {
  throw new Error(
    "FACEBOOK_APP_ID and FACEBOOK_APP_SECRET must be provided together.",
  );
}

export const FACEBOOK_APP_ID = facebookAppId;
export const FACEBOOK_APP_SECRET = facebookAppSecret;

// Sharing posts to Facebook Pages. Separate from sign-in: Better Auth never
// sees these tokens. A Meta app built for "Sign in with Facebook" can't always
// be given the Pages use case, so sharing may use a Meta app of its own:
// FACEBOOK_PAGES_APP_ID / _SECRET, both or neither. Unset, it uses the sign-in
// app above.
const facebookPagesAppId =
  process.env.FACEBOOK_PAGES_APP_ID?.trim() || undefined;
const facebookPagesAppSecret =
  process.env.FACEBOOK_PAGES_APP_SECRET?.trim() || undefined;
if (Boolean(facebookPagesAppId) !== Boolean(facebookPagesAppSecret)) {
  throw new Error(
    "FACEBOOK_PAGES_APP_ID and FACEBOOK_PAGES_APP_SECRET must be provided together.",
  );
}
export const FACEBOOK_PAGES_APP_ID = facebookPagesAppId;
export const FACEBOOK_PAGES_APP_SECRET = facebookPagesAppSecret;
// Sharing is on only when an app and this key are both set. The key encrypts
// the stored Page and user tokens (AES-256-GCM): 32 random bytes, base64
// (`openssl rand -base64 32`). A key that is set but not 32 bytes stops the
// API at boot instead of failing the first time someone connects.
const facebookTokenKeyRaw =
  process.env.FACEBOOK_TOKEN_ENCRYPTION_KEY?.trim() || undefined;
if (
  facebookTokenKeyRaw &&
  Buffer.from(facebookTokenKeyRaw, "base64").length !== 32
) {
  throw new Error(
    "FACEBOOK_TOKEN_ENCRYPTION_KEY must be 32 bytes, base64-encoded (openssl rand -base64 32).",
  );
}
export const FACEBOOK_TOKEN_ENCRYPTION_KEY = facebookTokenKeyRaw;
// The Graph API version every call is pinned to.
export const FACEBOOK_GRAPH_VERSION =
  process.env.FACEBOOK_GRAPH_VERSION?.trim() || "v26.0";
// Set when the Meta app is a Business app using Facebook Login for Business:
// the login dialog then takes this configuration instead of a scope list.
export const FACEBOOK_LOGIN_CONFIG_ID =
  process.env.FACEBOOK_LOGIN_CONFIG_ID?.trim() || undefined;
// Where Meta sends the browser back after the Page permission dialog. It must
// be listed under the Meta app's Valid OAuth Redirect URIs.
export const FACEBOOK_PAGES_REDIRECT_URI =
  process.env.FACEBOOK_PAGES_REDIRECT_URI?.trim() ||
  `${BETTER_AUTH_URL.replace(/\/+$/, "")}/api/v1/integrations/facebook/callback`;
