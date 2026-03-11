// src/app.ts
import express from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import router from "./routes";
import { isDev, FRONTEND_URL } from "./config";
import cors from "cors";
import { createServer } from "http";
import { Server } from "socket.io";
import setup from "./setup";

const app = express();

app.set("trust proxy", 1);

// CORS configuration - allow both localhost ports and production origin
const allowedOrigins = [
  "http://localhost:3000",
  "http://localhost:3001",
  "http://localhost:3002",
  process.env.FRONTEND_URL || "",
].filter(Boolean);

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

const server = createServer(app);

export const io = new Server(server, {
  cors: {
    origin: FRONTEND_URL,
    methods: ["GET", "POST"],
    credentials: true,
  },
});

export default server;
