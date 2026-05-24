"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv_1 = __importDefault(require("dotenv"));
const express_1 = __importDefault(require("express"));
const pg_1 = require("pg");
const mongoose_1 = __importDefault(require("mongoose"));
dotenv_1.default.config();
const app = (0, express_1.default)();
const port = Number(process.env.PORT) || 4000;
app.use(express_1.default.json());
const databaseUrl = process.env.DATABASE_URL;
const mongoUri = process.env.MONGODB_URI;
if (!databaseUrl) {
    throw new Error("DATABASE_URL is required");
}
if (!mongoUri) {
    throw new Error("MONGODB_URI is required");
}
const pgPool = new pg_1.Pool({ connectionString: databaseUrl });
let postgresStatus = "disconnected";
let mongoStatus = "disconnected";
app.get("/health", (_req, res) => {
    res.json({
        status: "ok",
        postgres: postgresStatus,
        mongo: mongoStatus
    });
});
const start = async () => {
    try {
        await pgPool.query("SELECT 1");
        postgresStatus = "connected";
        console.log("PostgreSQL connected");
        await mongoose_1.default.connect(mongoUri);
        mongoStatus = "connected";
        console.log("MongoDB connected");
        app.listen(port, () => {
            console.log(`Core service is running on port ${port}`);
        });
    }
    catch (error) {
        console.error("Failed to start core service:", error);
        process.exit(1);
    }
};
void start();
