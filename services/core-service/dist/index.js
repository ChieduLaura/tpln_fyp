"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv = __importStar(require("dotenv"));
dotenv.config();
const express_1 = __importDefault(require("express"));
const mongoose_1 = __importDefault(require("mongoose"));
const cors_1 = __importDefault(require("cors"));
const auth_1 = __importDefault(require("./routes/auth"));
const projects_1 = __importDefault(require("./routes/projects"));
const tasks_1 = __importDefault(require("./routes/tasks"));
const lifecycle_1 = require("./middleware/lifecycle");
const pool_1 = __importDefault(require("./db/pool"));
const migrate_1 = require("./db/migrate");
const app = (0, express_1.default)();
const port = Number(process.env.PORT) || 4000;
const allowedOrigin = process.env.FRONTEND_URL || "http://localhost:3000";
const mongoUri = process.env.MONGODB_URI;
if (!mongoUri) {
    throw new Error("MONGODB_URI is required");
}
app.use((0, cors_1.default)({ origin: allowedOrigin, credentials: true }));
app.use(express_1.default.json());
app.use(lifecycle_1.lifecycleMiddleware);
app.use("/auth", auth_1.default);
app.use(projects_1.default);
app.use(tasks_1.default);
app.get("/health", (_req, res) => {
    res.json({
        status: "ok",
        postgres: postgresStatus,
        mongo: mongoStatus
    });
});
let postgresStatus = "disconnected";
let mongoStatus = "disconnected";
const start = async () => {
    try {
        // 1. Apply the schema to the app-owned namespace before serving traffic.
        await (0, migrate_1.runMigration)();
        // 2. Verify basic connection to Postgres
        await pool_1.default.query("SELECT 1");
        postgresStatus = "connected";
        console.log("PostgreSQL connected successfully!");
        // 3. Connect to MongoDB
        await mongoose_1.default.connect(mongoUri);
        mongoStatus = "connected";
        console.log("MongoDB connected");
        // 4. Start the Express App Server
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
