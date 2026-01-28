import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET as string;

export interface AuthenticateRequest extends Request {
  userId?: string;
  businessId?: string;
}

type JwtPayload = {
  userId: string;
  businessId?: string;
};

export const protect = (req: AuthenticateRequest, res: Response, next: NextFunction) => {
  const authHeader =
    (req.headers.authorization as string | undefined) ??
    (req.headers.Authorization as string | undefined);

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ message: "No token" });
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as JwtPayload;

    req.userId = decoded.userId;
    if (decoded.businessId) req.businessId = decoded.businessId;

    return next();
  } catch {
    return res.status(401).json({ message: "Invalid Token" });
  }
};

// Backwards-compatible name (so routes can import requireAuth)
export const requireAuth = protect;
