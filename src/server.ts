import { createServer } from "http";
import app from "./app";
import { PORT } from "./config";
import { initSocketServer } from "./infrastructure/socket/socket.server";
import { registerSocketGateway } from "./infrastructure/socket/socket.gateway";

const httpServer = createServer(app);

const io = initSocketServer(httpServer);
registerSocketGateway(io);

httpServer.listen(PORT, () => {
  console.log(`🚀 Server is running on http://localhost:${PORT}`);
});