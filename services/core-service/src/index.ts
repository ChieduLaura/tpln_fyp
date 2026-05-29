import * as dotenv from "dotenv";
dotenv.config();
import http from "http";
import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import { Server as SocketIOServer } from "socket.io";
import authRouter from "./routes/auth";
import projectsRouter from "./routes/projects";
import tasksRouter from "./routes/tasks";
import { lifecycleMiddleware } from "./middleware/lifecycle";
import pool from "./db/pool";
import { runMigration } from "./db/migrate";
import { notificationService } from "./services/notificationService";
import { startForecastJob } from "./jobs/forecastJob";

const app = express();
const port = Number(process.env.PORT) || 4000;
const allowedOrigin = process.env.FRONTEND_URL || "http://localhost:3000";
const server = http.createServer(app);
const io = new SocketIOServer(server, {
  cors: { origin: allowedOrigin, credentials: true }
});

io.on("connection", (socket) => {
  socket.on("join_project", (payload: { projectId?: string } | string) => {
    const projectId = typeof payload === "string" ? payload : payload.projectId;
    if (!projectId) {
      return;
    }

    socket.join(projectId);
  });

  socket.on("leave_project", (payload: { projectId?: string } | string) => {
    const projectId = typeof payload === "string" ? payload : payload.projectId;
    if (!projectId) {
      return;
    }

    socket.leave(projectId);
  });
});

notificationService.setSocketServer(io);

const mongoUri = process.env.MONGODB_URI;
if (!mongoUri) {
  throw new Error("MONGODB_URI is required");
}

app.use(cors({ origin: allowedOrigin, credentials: true }));
app.use(express.json());
app.use(lifecycleMiddleware);
app.use("/auth", authRouter);
app.use(projectsRouter);
app.use(tasksRouter);

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    postgres: postgresStatus,
    mongo: mongoStatus
  });
});

let postgresStatus = "disconnected";
let mongoStatus = "disconnected";

const start = async (): Promise<void> => {
  try {
    // 1. Apply the schema to the app-owned namespace before serving traffic.
    await runMigration();

    // 2. Verify basic connection to Postgres
    await pool.query("SELECT 1");
    postgresStatus = "connected";
    console.log("PostgreSQL connected successfully!");

    // 3. Connect to MongoDB
    await mongoose.connect(mongoUri);
    mongoStatus = "connected";
    console.log("MongoDB connected");

    // 4. Start the Express App Server
    server.listen(port, () => {
      console.log(`Core service is running on port ${port}`);
    });

    startForecastJob();
  } catch (error) {
    console.error("Failed to start core service:", error);
    process.exit(1);
  }
};

void start();