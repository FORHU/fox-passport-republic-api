// src/server.ts
import server from "./app"; // Renamed from 'app' to 'server' for clarity
import { PORT } from "./config";

server.listen(PORT, () => {
    console.log(`🚀 Server is running on http://localhost:${PORT}`);
});