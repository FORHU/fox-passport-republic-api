import { createServer } from "http";
import app from "./app";
import { PORT } from "./config";
import { initSocketServer } from "./infrastructure/socket/socket.server";
import { registerSocketGateway } from "./infrastructure/socket/socket.gateway";
import { scheduleBookingReminders } from "./jobs/booking-reminders.job";

const httpServer = createServer(app);

const io = initSocketServer(httpServer);
registerSocketGateway(io);

// Depends on the socket server above: notifications created by the sweep are
// pushed over it, so scheduling this any earlier would emit into a void.
scheduleBookingReminders();

httpServer.listen(PORT, () => {
  console.log(`🚀 Server is running on http://localhost:${PORT}`);
});
