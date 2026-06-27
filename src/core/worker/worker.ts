import { DatabaseQueue } from '../queue/database-queue';
import { Job } from '@prisma/client';
import { resolveAndValidateHost } from '../../utils/ssrf';
import { activeWorkersGauge, jobDurationHistogram, jobFailureCounter, processedcounter } from '../../utils/metrices';

export interface WorkerOptions {
  concurrency?: number;
  pollIntervalMs?: number;
}

export class Worker {
  private queue: DatabaseQueue;
  private workerId: string;
  private concurrency: number;
  private pollIntervalMs: number;
  private activeJobsCount = 0;
  private isRunning = false;
  private timer: NodeJS.Timeout | null = null;

  constructor(workerId: string, options: WorkerOptions = {}) {
    this.queue = new DatabaseQueue();
    this.workerId = workerId;
    this.concurrency = options.concurrency ?? 5;
    this.pollIntervalMs = options.pollIntervalMs ?? 1000;
  }

  start(): void {
    console.log("started")
    if (this.isRunning) return;
    this.isRunning = true;
    console.log(`[Worker ${this.workerId}] Starting with concurrency limit ${this.concurrency}...`);
    this.tick();
  }

  stop(): void {
    this.isRunning = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    console.log(`[Worker ${this.workerId}] Stopped worker.`);
  }

  private tick(): void {
    if (!this.isRunning) return;

    this.pollAndExecute()
      .catch((err) => console.error(`[Worker ${this.workerId}] Error in poll cycle:`, err))
      .finally(() => {
        if (this.isRunning) {
          this.timer = setTimeout(() => this.tick(), this.pollIntervalMs);
        }
      });
  }

  private async pollAndExecute(): Promise<void> {
    console.log("polling....")
    while (this.activeJobsCount < this.concurrency && this.isRunning) {
      const job = await this.queue.fetchNextJob(this.workerId);
      if (!job) {
        console.log("no job")
        break;
      }

      this.activeJobsCount++;
      this.runJob(job)
        .catch((err) => console.error(`[Worker ${this.workerId}] Uncaught job execution error:`, err))
        .finally(() => {
          this.activeJobsCount--;
          if (this.isRunning) {
            process.nextTick(() => this.tick());
          }
        });
    }
  }

  private async runJob(job: Job): Promise<void> {
    activeWorkersGauge.inc()
    const timer = jobDurationHistogram.startTimer()
    console.log(`[Worker ${this.workerId}] Executing job ${job.id} (name: ${job.name})...`);

    try {
      const delay = Math.floor(Math.random() * 5000) + 1000;

      await new Promise((resolve) => setTimeout(resolve, delay))

      if (Math.random() < 0.2) {
        throw new Error("Execution failed")
      }

      await this.queue.completeJob(job.id, this.workerId)
      console.log(
        `[Worker ${this.workerId}] Completed ${job.id}`
      );
      processedcounter.inc()
    } catch (error) {
      console.error(error)
      await this.queue.failJob(
        job.id,
        this.workerId,

        error instanceof Error ? error.message : "Unknown error"
      );
    } finally {
      timer()
      activeWorkersGauge.dec()
    }


  }
}