import * as dotenv from "dotenv";
dotenv.config();
import express from "express";
import { Pool } from "pg";
import mongoose from "mongoose";
import authRouter from "./routes/auth";

const app = express();
const port = Number(process.env.PORT) || 4000;

app.use(express.json());
app.use("/auth", authRouter);

const databaseUrl = process.env.DATABASE_URL;
const mongoUri = process.env.MONGODB_URI;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required");
}

if (!mongoUri) {
  throw new Error("MONGODB_URI is required");
}

const pgPool = new Pool({ connectionString: databaseUrl });

let postgresStatus = "disconnected";
let mongoStatus = "disconnected";

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    postgres: postgresStatus,
    mongo: mongoStatus
  });
});

const start = async (): Promise<void> => {
  try {
    await pgPool.query("SELECT 1");
    postgresStatus = "connected";
    console.log("PostgreSQL connected");

    await mongoose.connect(mongoUri);
    mongoStatus = "connected";
    console.log("MongoDB connected");

    app.listen(port, () => {
      console.log(`Core service is running on port ${port}`);
    });
  } catch (error) {
    console.error("Failed to start core service:", error);
    process.exit(1);
  }
};

void start();
