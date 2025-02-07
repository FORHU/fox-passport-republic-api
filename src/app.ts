import { createBullBoard } from "@bull-board/api";
import { BullAdapter } from "@bull-board/api/bullAdapter";
import { ExpressAdapter } from "@bull-board/express";
import cors from "cors";
import express from "express";
import ExpressMongoSanitize from "express-mongo-sanitize";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import { createServer } from "http";
import { Server } from "socket.io";

import { isDev, RATE_LIMITER } from "./config";
import events from "./events";
import router from "./routes";
import setup from "./setup";
import { setupSwagger } from "./swagger";
import { connectToMongo } from "./utils/mongo";
import { sendEmailQueue } from "./utils/queues/email/email.queue";
import { enquiryQueue } from "./utils/queues/enquiries/enquries-status.queue";
import { fileQueue } from "./utils/queues/files/file-migration.queue";
import { invoiceQueue } from "./utils/queues/invoice";
import { startJobs } from "./utils/queues/jobs";
import { paymentQueue } from "./utils/queues/payment/payment.queue";
import { questionDeletionQueue } from "./utils/queues/question/delete-question.queue";
import { stripeAccountQueue } from "./utils/queues/stripe/stripe.email";
import { adminTeamMemberQueue } from "./utils/queues/suspension/admin-team-member.queue";
import { venueOwnerTeamMemberQueue } from "./utils/queues/suspension/venue-owner-member.queue";
import { useRolesQueue } from "./utils/queues/user/migrate-user.queue";
import { addVenueQueue } from "./utils/queues/venue/add-venue.queue";
import { userTenantQueue } from "./utils/queues/tenant/user.tenant.queue";
import { venueTenantQueue } from "./utils/queues/tenant/venue.tenant.queue";
import { userLogsQueue } from "./utils/queues/user-logs";

// Initialize Express app
const app = express();

// Create Bull Board and attach the enquiry queue
const serverAdapter = new ExpressAdapter();
createBullBoard({
  queues: [
    new BullAdapter(enquiryQueue),
    new BullAdapter(paymentQueue),
    new BullAdapter(sendEmailQueue),
    new BullAdapter(invoiceQueue),
    new BullAdapter(stripeAccountQueue),
    new BullAdapter(fileQueue),
    new BullAdapter(questionDeletionQueue),
    new BullAdapter(adminTeamMemberQueue),
    new BullAdapter(venueOwnerTeamMemberQueue),
    new BullAdapter(addVenueQueue),
    new BullAdapter(useRolesQueue),
    new BullAdapter(userTenantQueue),
    new BullAdapter(venueTenantQueue),
    new BullAdapter(userLogsQueue),
  ],
  serverAdapter,
});

serverAdapter.setBasePath("/admin/queues");
app.use("/admin/queues", serverAdapter.getRouter());

setupSwagger(app);

app.set("trust proxy", 1);

app.use(
  cors({
    origin: "*",
    credentials: true,
  }),
);

app.use(express.json());
app.use(ExpressMongoSanitize());

// Set up rate limiting middleware
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: RATE_LIMITER, // limit each IP to 100 requests per windowMs
});

if (!isDev) app.use(limiter);

// Set up security headers
app.use(helmet());
app.disable("x-powered-by");

// Initiate jobs
startJobs();

// Use router for routing
app.use("/api", router);

// Create HTTP server for Express
const server = createServer(app);

export const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
    credentials: true,
  },
});

// WebSocket events
events(io);

// Connect to MongoDB
connectToMongo()
  .then(() => {
    setup();
  })
  .catch((err) => {
    console.log(err);
  });

// Export the combined server
export default server;
