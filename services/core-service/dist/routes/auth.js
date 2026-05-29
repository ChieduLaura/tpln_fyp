"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const zod_1 = require("zod");
const auth_1 = require("../middleware/auth");
const pool_1 = __importDefault(require("../db/pool"));
const router = (0, express_1.Router)();
const JWT_SECRET = process.env.JWT_SECRET;
const ACCESS_TOKEN_TTL = (process.env.JWT_EXPIRES_IN || "15m");
const REFRESH_TOKEN_TTL = (process.env.REFRESH_TOKEN_EXPIRES_IN || "7d");
const registerSchema = zod_1.z.object({
    email: zod_1.z.string().email(),
    password: zod_1.z.string().min(8),
    full_name: zod_1.z.string().min(1)
});
const loginSchema = zod_1.z.object({
    email: zod_1.z.string().email(),
    password: zod_1.z.string().min(1)
});
function assertJwtSecret(res) {
    if (!JWT_SECRET) {
        res.status(500).json({ message: "JWT_SECRET is not configured" });
        return undefined;
    }
    return JWT_SECRET;
}
function signTokens(user, secret) {
    const payload = {
        id: user.id,
        email: user.email,
        role: user.role,
        full_name: user.full_name
    };
    const accessToken = jsonwebtoken_1.default.sign(payload, secret, { expiresIn: ACCESS_TOKEN_TTL });
    const refreshToken = jsonwebtoken_1.default.sign(payload, secret, { expiresIn: REFRESH_TOKEN_TTL });
    return { accessToken, refreshToken };
}
router.post("/register", async (req, res) => {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ message: "Invalid request body", errors: parsed.error.flatten() });
        return;
    }
    const secret = assertJwtSecret(res);
    if (!secret) {
        return;
    }
    const { email, password, full_name } = parsed.data;
    try {
        const existing = await pool_1.default.query("SELECT id FROM users WHERE email = $1", [email]);
        if (existing.rowCount && existing.rowCount > 0) {
            res.status(409).json({ message: "Email already exists" });
            return;
        }
        const passwordHash = await bcryptjs_1.default.hash(password, 12);
        const result = await pool_1.default.query(`INSERT INTO users (id, email, password_hash, full_name, role)
       VALUES (gen_random_uuid(), $1, $2, $3, 'member')
       RETURNING id, email, role, full_name`, [email, passwordHash, full_name]);
        const user = result.rows[0];
        const { accessToken } = signTokens(user, secret);
        res.status(201).json({
            message: "User registered successfully",
            user,
            token: accessToken
        });
    }
    catch (error) {
        console.error("Register error:", error);
        res.status(500).json({ message: "Failed to register user" });
    }
});
router.post("/login", async (req, res) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ message: "Invalid request body", errors: parsed.error.flatten() });
        return;
    }
    const secret = assertJwtSecret(res);
    if (!secret) {
        return;
    }
    const { email, password } = parsed.data;
    try {
        const result = await pool_1.default.query("SELECT id, email, password_hash, role, full_name FROM users WHERE email = $1", [email]);
        if (result.rowCount === 0) {
            res.status(401).json({ message: "Invalid email or password" });
            return;
        }
        const userRow = result.rows[0];
        const passwordMatches = await bcryptjs_1.default.compare(password, userRow.password_hash);
        if (!passwordMatches) {
            res.status(401).json({ message: "Invalid email or password" });
            return;
        }
        const user = {
            id: userRow.id,
            email: userRow.email,
            role: userRow.role,
            full_name: userRow.full_name
        };
        const { accessToken, refreshToken } = signTokens(user, secret);
        res.cookie("refreshToken", refreshToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "lax",
            path: "/auth"
        });
        res.status(200).json({
            message: "Login successful",
            user,
            token: accessToken
        });
    }
    catch (error) {
        console.error("Login error:", error);
        res.status(500).json({ message: "Failed to login" });
    }
});
router.post("/logout", (_req, res) => {
    res.clearCookie("refreshToken", { path: "/auth" });
    res.status(204).send();
});
router.get("/me", auth_1.requireAuth, async (req, res) => {
    if (!req.user) {
        res.status(401).json({ message: "Unauthorized" });
        return;
    }
    try {
        const result = await pool_1.default.query("SELECT id, email, role, full_name, created_at, updated_at FROM users WHERE id = $1", [req.user.id]);
        if (result.rowCount === 0) {
            res.status(404).json({ message: "User not found" });
            return;
        }
        res.status(200).json({ user: result.rows[0] });
    }
    catch (error) {
        console.error("Me error:", error);
        res.status(500).json({ message: "Failed to fetch current user" });
    }
});
exports.default = router;
