import { NextFunction, Request, Response } from "express";
import jwt, { JwtPayload } from "jsonwebtoken";

export interface AuthUser {
  id: string;
  email: string;
  role: "owner" | "member" | "viewer";
  full_name?: string | null;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

type AuthTokenPayload = JwtPayload & AuthUser;

const JWT_SECRET = process.env.JWT_SECRET;

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!JWT_SECRET) {
    res.status(500).json({ message: "JWT_SECRET is not configured" });
    return;
  }

  const authorization = req.header("authorization");
  if (!authorization || !authorization.startsWith("Bearer ")) {
    res.status(401).json({ message: "Missing or invalid authorization header" });
    return;
  }

  const token = authorization.slice(7).trim();
  if (!token) {
    res.status(401).json({ message: "Missing bearer token" });
    return;
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as AuthTokenPayload;
    req.user = {
      id: decoded.id,
      email: decoded.email,
      role: decoded.role,
      full_name: decoded.full_name ?? null
    };
    next();
  } catch {
    res.status(401).json({ message: "Invalid or expired token" });
  }
}
