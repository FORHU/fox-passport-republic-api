// src/app.ts
import express from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import router from "./routes";
import { isDev, CORS_ORIGINS } from "./config";
import cors from "cors";
import setup from "./setup";
import stripeConnectRoutes from "./modules/stripe-connect/stripe-connect.routes";

const app = express();

app.set("trust proxy", 1);

// CORS configuration - allow the configured origins plus the local dev ports.
const allowedOrigins = [
  "http://localhost:6001", // front-end (6000 is unusable: browsers block it as the x11 port)
  "http://localhost:6002", // this API
  ...CORS_ORIGINS,
];

// In development also accept any loopback or private-LAN origin, so changing the
// front-end port (or opening the app via a LAN IP on a phone) doesn't require
// editing this list and restarting the API.
const LOCAL_ORIGIN =
  /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\]|192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3})(:\d+)?$/;

app.use(
  cors({
    origin: (origin, callback) => {
      if (
        !origin ||
        allowedOrigins.includes(origin) ||
        (isDev && LOCAL_ORIGIN.test(origin))
      ) {
        callback(null, true);
      } else {
        // Name the origin - "Not allowed by CORS" alone is undebuggable.
        callback(new Error(`Not allowed by CORS: ${origin}`));
      }
    },
    credentials: true,
  }),
);

// Stripe webhook must receive raw body — register BEFORE express.json()
app.use("/api/v1/payments/webhook", express.raw({ type: "application/json" }));

// allow larger payloads for base64 image uploads
app.use(express.json({ limit: "10mb" }));

// Request Logger. Dev only - in production this is pure noise on every request.
// Tagged by origin because a page refresh produces two very different bursts:
// Next.js server components rendering (ssr) and the browser hydrating (browser).
if (process.env.NODE_ENV !== "production") {
  app.use((req, _res, next) => {
    const source =
      req.headers["sec-fetch-mode"] || req.headers["origin"]
        ? "browser"
        : "ssr";
    console.log(`📨 [${source}] ${req.method} ${req.originalUrl}`);
    next();
  });
}

// Rate Limiter
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000,
});

if (!isDev) app.use(limiter);

app.use(helmet());
app.disable("x-powered-by");

// Initialize setup
setup();

app.use("/api", router);
console.log("✅ Main router mounted");

app.use("/api/v1/stripe-connect", stripeConnectRoutes);

// 404 Handler for /api
app.use("/api", (req, res) => {
  console.warn(`🕵️ 404 NOT FOUND: ${req.method} ${req.originalUrl}`);
  res.status(404).json({
    success: false,
    message: `Endpoint ${req.method} ${req.originalUrl} not found`,
  });
});

// Global error handler
/** An Error that carries an HTTP status for the global handler to honour. */
interface HttpError extends Error {
  status?: number;
}

function toHttpError(err: unknown): HttpError {
  if (err instanceof Error) return err as HttpError;
  return new Error(
    typeof err === "string" ? err : "An unexpected error occurred",
  );
}

app.use(
  (
    err: unknown,
    req: express.Request,
    res: express.Response,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    next: express.NextFunction,
  ) => {
    const error = toHttpError(err);
    console.error("❌ GLOBAL ERROR:", error.message);
    res.status(error.status || 400).json({
      success: false,
      message: error.message || "An unexpected error occurred",
      stack: isDev ? error.stack : undefined,
    });
  },
);

export default app;
