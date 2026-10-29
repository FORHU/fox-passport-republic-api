import * as dotenv from "dotenv";
import { requireSecret } from "./utils/require-secret";
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
export const PLATFORM_FEE_PERCENT = Number(
  process.env.PLATFORM_FEE_PERCENT || 5,
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
