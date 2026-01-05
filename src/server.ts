// src/server.ts

// Load environment variables FIRST
import "dotenv/config";

import app from "./app";
import { PORT } from "./config";

const port = PORT || 3002;

app.listen(port, () => {
    console.log(`🚀 Server is running on http://localhost:${port}`);
});
