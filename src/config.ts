import * as dotenv from "dotenv";
import type { SignOptions } from "jsonwebtoken";
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
export const ACCESS_TOKEN_SECRET = process.env.ACCESS_TOKEN_SECRET as string;
export const REFRESH_TOKEN_SECRET = process.env.REFRESH_TOKEN_SECRET as string;

// `expiresIn` accepts a number of seconds or an ms-style string ("15m", "7d").
// Env vars are always strings, so narrow to the string half of that union
// rather than widening to `any`.
type TokenExpiry = Extract<SignOptions["expiresIn"], string>;

export const ACCESS_TOKEN_EXPIRY = (process.env.ACCESS_TOKEN_EXPIRY ??
  "15m") as TokenExpiry;
export const REFRESH_TOKEN_EXPIRY = (process.env.REFRESH_TOKEN_EXPIRY ??
  "7d") as TokenExpiry;
export const REDIS_HOST = process.env.REDIS_HOST as string;
export const REDIS_PORT = Number(process.env.REDIS_PORT || 6379);
export const REDIS_PASSWORD = process.env.REDIS_PASSWORD as string;
export const REDIS_TTL_SECONDS = Number(process.env.REDIS_TTL_SECONDS) || 3600;
export const SERVICE_ACCOUNT = process.env.SERVICE_ACCOUNT as string;
export const S3_CDN_URL = process.env.S3_CDN_URL as string;
export const AWS_ACCESS_KEY = process.env.AWS_ACCESS_KEY as string;
export const AWS_SECRET_ACCESS_KEY = process.env
  .AWS_SECRET_ACCESS_KEY as string;
export const AWS_S3_BUCKET = process.env.AWS_S3_BUCKET as string;
export const AWS_REGION = process.env.AWS_REGION as string;
export const CLOUD_FRONT_DOMAIN = process.env.CLOUD_FRONT_DOMAIN as
  string | undefined;

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
