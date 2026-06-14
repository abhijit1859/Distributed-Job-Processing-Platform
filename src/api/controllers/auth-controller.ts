import * as z from "zod";
import type { Request, Response } from "express";
import { prisma } from "../../db/client";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "supersecretjwtkey";

const registerSchema = z.object({
    name: z.string().min(3, "Name should be of minimum 3 characters"),
    email: z.string().email("Invalid email format"),
    password: z.string().min(5, "Password must be of at least 5 characters"),
});

const loginSchema = z.object({
    email: z.string().email("Invalid email format"),
    password: z.string().min(5, "Password must be of at least 5 characters"),
});

export class authController {
    static async register(req: Request, res: Response): Promise<void> {
        try {
            const parsed = registerSchema.safeParse(req.body);
            if (!parsed.success) {
                res.status(400).json({
                    success: false,
                    message: "Validation failed",
                    errors: parsed.error.format()
                });
                return;
            }

            const { name, email, password } = parsed.data;

             const existingUser = await prisma.user.findUnique({
                where: { email }
            });

            if (existingUser) {
                res.status(400).json({
                    success: false,
                    message: "User already exists with this email"
                });
                return;
            }

             const hashedPassword = await bcrypt.hash(password, 10);

             const user = await prisma.user.create({
                data: {
                    name,
                    email,
                    password: hashedPassword,
                    role: "USER"  
                }
            });

             const token = jwt.sign(
                { id: user.id, email: user.email, role: user.role },
                JWT_SECRET,
                { expiresIn: "24h" }
            );

            res.status(201).json({
                success: true,
                message: "User registered successfully",
                token,
                user: {
                    id: user.id,
                    name: user.name,
                    email: user.email,
                    role: user.role
                }
            });
        } catch (error) {
            console.error("Registration error:", error);
            res.status(500).json({
                success: false,
                message: "Internal server error"
            });
        }
    }

    static async login(req: Request, res: Response): Promise<void> {
        try {
            const parsed = loginSchema.safeParse(req.body);
            if (!parsed.success) {
                res.status(400).json({
                    success: false,
                    message: "Validation failed",
                    errors: parsed.error.format()
                });
                return;
            }

            const { email, password } = parsed.data;

             const user = await prisma.user.findUnique({
                where: { email }
            });

            if (!user) {
                res.status(401).json({
                    success: false,
                    message: "Invalid email or password"
                });
                return;
            }

             const isPasswordValid = await bcrypt.compare(password, user.password);
            if (!isPasswordValid) {
                res.status(401).json({
                    success: false,
                    message: "Invalid email or password"
                });
                return;
            }

             const token = jwt.sign(
                { id: user.id, email: user.email, role: user.role },
                JWT_SECRET,
                { expiresIn: "24h" }
            );

            res.status(200).json({
                success: true,
                message: "Login successful",
                token,
                user: {
                    id: user.id,
                    name: user.name,
                    email: user.email,
                    role: user.role
                }
            });
        } catch (error) {
            console.error("Login error:", error);
            res.status(500).json({
                success: false,
                message: "Internal server error"
            });
        }
    }

    static async logout(req: Request, res: Response): Promise<void> {
       
        res.status(200).json({
            success: true,
            message: "Logout successful. Please delete your token."
        });
    }
}