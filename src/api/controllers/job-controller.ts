import { BackoffType, JobState } from "@prisma/client";
import { prisma } from "../../db/client";
import type { Request, Response } from "express";
import type { AuthenticatedRequest } from "../middlewares/auth-middleware";
import * as z from "zod"
import { DatabaseQueue } from "../../core/queue/database-queue";

const enqueueSchema = z.object({
    name: z.string().min(3, "minimum of length 3"),
    payload: z.object({
        url: z.string().url("Invalid payload url"),
        method: z.enum(['GET', 'POST', 'PUT', 'DELETE', 'PATCH']),
        headers: z.record(z.string(), z.string()).optional(),
        body: z.unknown().optional()
    }),
    priority: z.number().int().min(0).max(30).optional(),
    runAt: z.string().datetime().transform((val) => new Date(val)).optional(),
    maxRetries: z.number().int().min(0).optional(),
    backoffType: z.nativeEnum(BackoffType).optional(),
    timeout: z.number().int().positive().optional()
})

const queue = new DatabaseQueue()

export class jobControllers {
    static async enqueue(req: Request, res: Response): Promise<void> {
        try {
            const authReq = req as AuthenticatedRequest;
            const userId = authReq.user?.id;
            if (!userId) {
                res.status(401).json({
                    success: false,
                    message: "Unauthorized: User not authenticated"
                });
                return;
            }

            const parsed = enqueueSchema.safeParse(req.body)

            if (!parsed.success) {
                res.status(400).json({
                    success: false,
                    errors: parsed.error.format()
                })
                return
            }

            const {name,payload,...options}=parsed.data
            const job = await queue.enqueue(userId,name,payload,options)

            res.status(201).json({
                success: true,
                data: job
            })
        } catch (error) {
            console.error(error)
            res.status(500).json({
                message: error
            })
        }

    }

    static async listJobs(req: Request, res: Response) {
        const jobs = await prisma.job.findMany({
            orderBy: { updatedAt: 'desc' }
        })
        res.status(200).json({
            "JOBS": jobs
        })
    }

    static async getJob(req: Request, res: Response): Promise<void> {
        const id = req.params.id as string;
        try {
            const job = await prisma.job.findUnique({
                where: { id }
            })
            if (!job) {
                console.log(`No job found with id JOB-ID:${id}`)
            }
            res.status(200).json({
                job
            })
        } catch (error) {
            console.error(error)
            res.status(500).json({
                message: "Internal server error"
            })
        }
    }

    static async cancelJob(req: Request, res: Response): Promise<void> {

    }
}