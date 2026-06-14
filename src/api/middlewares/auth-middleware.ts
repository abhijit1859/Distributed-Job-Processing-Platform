import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "supersecretjwtkey";

export interface AuthenticatedRequest extends Request {
    user?: {
        id: string;
        email: string;
        role: "ADMIN" | "USER";
    };
}

export function authenticateJWT(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
        res.status(401).json({
            success: false,
            message: "Access token is missing or invalid"
        });
        return;
    }

    const token = authHeader.split(" ")[1];

    try {
        const decoded = jwt.verify(token, JWT_SECRET) as {
            id: string;
            email: string;
            role: "ADMIN" | "USER";
        };
        req.user = decoded;
        next();
    } catch (error) {
        res.status(403).json({
            success: false,
            message: "Token is expired or invalid"
        });
    }
}

export function requireRole(roles: Array<"ADMIN" | "USER">) {
    return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
        if (!req.user) {
            res.status(401).json({
                success: false,
                message: "Unauthorized"
            });
            return;
        }

        if (!roles.includes(req.user.role)) {
            res.status(403).json({
                success: false,
                message: "Forbidden: You do not have permission to access this resource"
            });
            return;
        }

        next();
    };
}
