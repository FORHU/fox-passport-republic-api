// src/app.ts
import express from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import router from "./routes";
import { isDev, FRONTEND_URL } from "./config";
import cors from "cors";
import setup from "./setup";

const app = express();

app.set("trust proxy", 1);

// CORS configuration - allow both localhost ports and production origin
const extraOrigins = (process.env.FRONTEND_URL || "")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

const allowedOrigins = [
  "http://localhost:3000",
  "http://localhost:3001",
  "http://localhost:3002",
  ...extraOrigins,
];

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true,
  })
);

// Stripe webhook must receive raw body — register BEFORE express.json()
app.use('/api/v1/payments/webhook', express.raw({ type: 'application/json' }));

// allow larger payloads for base64 image uploads
app.use(express.json({ limit: '10mb' }));

// Request Logger
app.use((req, res, next) => {
  console.log(`📨 ${req.method} ${req.url} (Full: ${req.originalUrl})`);
  next();
});


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

// 404 Handler for /api
app.use("/api", (req, res) => {
  console.warn(`🕵️ 404 NOT FOUND: ${req.method} ${req.originalUrl}`);
  res.status(404).json({
    success: false,
    message: `Endpoint ${req.method} ${req.originalUrl} not found`
  });
});

// Global error handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error("❌ GLOBAL ERROR:", err.message);
  res.status(err.status || 400).json({
    success: false,
    message: err.message || "An unexpected error occurred",
    stack: isDev ? err.stack : undefined
  });
});

export default app;
