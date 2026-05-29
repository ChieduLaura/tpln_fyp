import { Router, Request, Response } from "express";
import bcrypt from "bcryptjs";
import jwt, { type SignOptions } from "jsonwebtoken";
import { z } from "zod";
import { requireAuth } from "../middleware/auth";
import pool from "../db/pool";

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET;
const ACCESS_TOKEN_TTL = (process.env.JWT_EXPIRES_IN || "15m") as SignOptions["expiresIn"];
const REFRESH_TOKEN_TTL = (process.env.REFRESH_TOKEN_EXPIRES_IN || "7d") as SignOptions["expiresIn"];

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  full_name: z.string().min(1)
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1)
});

function assertJwtSecret(res: Response): string | undefined {
  if (!JWT_SECRET) {
    res.status(500).json({ message: "JWT_SECRET is not configured" });
    return undefined;
  }

  return JWT_SECRET;
}

function signTokens(user: { id: string; email: string; role: "owner" | "member" | "viewer"; full_name: string | null }, secret: string) {
  const payload = {
    id: user.id,
    email: user.email,
    role: user.role,
    full_name: user.full_name
  };

  const accessToken = jwt.sign(payload, secret, { expiresIn: ACCESS_TOKEN_TTL });
  const refreshToken = jwt.sign(payload, secret, { expiresIn: REFRESH_TOKEN_TTL });

  return { accessToken, refreshToken };
}

router.post("/register", async (req: Request, res: Response) => {
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
    const existing = await pool.query("SELECT id FROM users WHERE email = $1", [email]);
    if (existing.rowCount && existing.rowCount > 0) {
      res.status(409).json({ message: "Email already exists" });
      return;
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const result = await pool.query(
      `INSERT INTO users (id, email, password_hash, full_name, role)
       VALUES (gen_random_uuid(), $1, $2, $3, 'member')
       RETURNING id, email, role, full_name`,
      [email, passwordHash, full_name]
    );

    const user = result.rows[0] as { id: string; email: string; role: "owner" | "member" | "viewer"; full_name: string | null };
    const { accessToken } = signTokens(user, secret);

    res.status(201).json({
      message: "User registered successfully",
      user,
      token: accessToken
    });
  } catch (error) {
    console.error("Register error:", error);
    res.status(500).json({ message: "Failed to register user" });
  }
});

router.post("/login", async (req: Request, res: Response) => {
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
    const result = await pool.query(
      "SELECT id, email, password_hash, role, full_name FROM users WHERE email = $1",
      [email]
    );

    if (result.rowCount === 0) {
      res.status(401).json({ message: "Invalid email or password" });
      return;
    }

    const userRow = result.rows[0] as {
      id: string;
      email: string;
      password_hash: string;
      role: "owner" | "member" | "viewer";
      full_name: string | null;
    };

    const passwordMatches = await bcrypt.compare(password, userRow.password_hash);
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
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ message: "Failed to login" });
  }
});

router.post("/logout", (_req: Request, res: Response) => {
  res.clearCookie("refreshToken", { path: "/auth" });
  res.status(204).send();
});

router.get("/me", requireAuth, async (req: Request, res: Response) => {
  if (!req.user) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }

  try {
    const result = await pool.query(
      "SELECT id, email, role, full_name, created_at, updated_at FROM users WHERE id = $1",
      [req.user.id]
    );

    if (result.rowCount === 0) {
      res.status(404).json({ message: "User not found" });
      return;
    }

    res.status(200).json({ user: result.rows[0] });
  } catch (error) {
    console.error("Me error:", error);
    res.status(500).json({ message: "Failed to fetch current user" });
  }
});

export default router;
