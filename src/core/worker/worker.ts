import { DatabaseQueue } from '../queue/database-queue';
import { Job } from '@prisma/client';
import { resolveAndValidateHost } from '../../shared/utils/ssrf';

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
    while (this.activeJobsCount < this.concurrency && this.isRunning) {
      const job = await this.queue.fetchNextJob(this.workerId);
      if (!job) {
        break; // No jobs ready
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
    console.log(`[Worker ${this.workerId}] Executing job ${job.id} (name: ${job.name})...`);
    
    const payload = job.payload as {
      url: string;
      method: string;
      headers?: Record<string, string>;
      body?: unknown;
    };

    if (!payload || !payload.url || !payload.method) {
      await this.queue.failJob(job.id, this.workerId, 'Invalid job payload: URL and Method are required.');
      return;
    }

    const abortController = new AbortController();
    const timeoutTimer = setTimeout(() => abortController.abort(), job.timeout);

    try {
      const urlObj = new URL(payload.url);
      
      // SSRF & DNS Rebinding prevention
      const ipAddress = await resolveAndValidateHost(urlObj.hostname);
      const targetUrl = `${urlObj.protocol}//${ipAddress}${urlObj.pathname}${urlObj.search}`;
      
      const headers = {
        ...payload.headers,
        'Host': urlObj.host, // Preserve Host header
        'X-Job-Id': job.id,   // Idempotency identifier
      };

      const response = await fetch(targetUrl, {
        method: payload.method,
        headers,
        body: payload.body ? JSON.stringify(payload.body) : undefined,
        signal: abortController.signal,
      });

      const textResponse = await response.text();
      const truncatedResponse = textResponse.slice(0, 4000); // Prevent DB bloat

      if (response.ok) {
        await this.queue.completeJob(job.id, this.workerId, response.status, truncatedResponse);
        console.log(`[Worker ${this.workerId}] Job ${job.id} COMPLETED (Status: ${response.status}).`);
      } else {
        const errorMsg = `HTTP Request failed with status code ${response.status}`;
        await this.queue.failJob(job.id, this.workerId, errorMsg, response.status, truncatedResponse);
        console.warn(`[Worker ${this.workerId}] Job ${job.id} FAILED (Status: ${response.status}).`);
      }
    } catch (err: any) {
      let errorMsg = err.message;
      if (err.name === 'AbortError') {
        errorMsg = `Job execution timed out after ${job.timeout}ms`;
      }
      await this.queue.failJob(job.id, this.workerId, errorMsg);
      console.error(`[Worker ${this.workerId}] Job ${job.id} execution failed:`, errorMsg);
    } finally {
      clearTimeout(timeoutTimer);
    }
  }
}
