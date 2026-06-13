import { BackoffType, Job, JobState } from "@prisma/client";
import { prisma } from "../../db/client";
import { calculateNextRun } from "../../shared/utils/backoff";

export interface EnqueueOptions {
  priority?: number;
  runtAt?: Date;
  maxRetries?: number;
  backoffType?: BackoffType;
  backoffDelay?: number;
  timeout?: number;

}

export interface Payload {
  url: string;
  method: string;
  header?: Record<string, string>;
  body?: unknown;
}

export class DatabaseQueue {
  async enqueue(name: string, payload: Payload, options: EnqueueOptions = {}) {
    return prisma.job.create({
      data: {
        name,
        payload: payload as any,
        priority: options.priority ?? 10,
        runAt: options.runtAt ?? new Date(),
        maxRetries: options.maxRetries ?? 3,
        backoffType: options.backoffType ?? BackoffType.FIXED,
        backoffDelay: options.backoffDelay ?? 1000,
        timeout: options.timeout ?? 60000,
        state: options.runtAt && options.runtAt > new Date() ? JobState.PENDING : JobState.QUEUED
      }
    })
  }

  async fetchNextJob(workerId: string): Promise<Job | null> {
    const result = await prisma.$queryRawUnsafe<Job[]>(
      `
      UPDATE "jobs"
      SET
        "state"="RUNNING"::"JobState,
        "locked_at"=NOW(),
        "loacket_by"=$1
        WHERE "id"=(
          SELECT "id" FROM "jobs"
          WHERE "state"= 'QUEUED' AND "run_at"<=NOW()
          ORDER BY "priority" DESC,"run_at" ASC LIMIT 1
          FOR UPDATE SKIP LOCKED
        )
          RETURNING *
      `,
      workerId
    )
    return result.length > 0 ? result[0] : null;
  }

  async completeJob(workerId: string, jobId: string, statusCode: number, responseBody: string) {
    await prisma.$transaction(async (tx) => {
      const job = await tx.job.findUnique({ where: { id: jobId } })
      if (!job) {
        throw new Error("No job found")
      }
      if (job.state !== JobState.RUNNING) throw new Error("Job is not in running state")

      await tx.job.update({
        where: { id: jobId },
        data: {
          state: JobState.COMPLETED,
          lockedAt: null,
          lockedBy: null
        }
      })

      await tx.jobExecution.create({
        data: {
          jobId,
          workerId,
          attempt: job.retriesCount + 1,
          state: JobState.COMPLETED,
          statusCode,
          responseBody,
          startedAt: job.lockedAt || new Date(),
          finishedAt: new Date(),
        }

      })

    })
  }

  async failJob(workerId: string, jobId: string,
    errorMsg: string,
    statusCode?: number,
    responseBody?: string
  ): Promise<void> {
    await prisma.$transaction(async (tx) => {
      const job = await tx.job.findUnique({
        where: {
          id: jobId
        }
      })

      if (!job) throw new Error("invalid job id")

      const nextRetryCount = job.retriesCount + 1;
      const canRetry = nextRetryCount <= job.maxRetries

      const nextState = canRetry ? JobState.QUEUED : JobState.FAILED
      const nextRunAt = canRetry ? calculateNextRun(nextRetryCount, job.backoffType, job.backoffDelay):job.runAt

      await tx.job.update({
        where: {
          id: jobId
        },
        data: {
          state: nextState,
          retriesCount: nextRetryCount,
          runAt: nextRunAt,
          lockedAt: null,
          lockedBy: null
        }
      })

      await tx.jobExecution.create({
        data:{
          jobId,
          workerId,
          attempt:nextRetryCount,
          state:JobState.FAILED,
          statusCode,
          responseBody,
          startedAt:job.lockedAt||new Date(),
          finishedAt:new Date(),
          error:errorMsg
        }
      })
    })
  }

}