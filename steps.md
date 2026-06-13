# Milestone 3: Worker Engine & Concurrency Control

Follow these hands-on steps to build the background worker process that pulls jobs, runs them, handles timeouts, and runs multiple concurrent execution loops safely.

---

## 🔒 Step 3.1: Implement SSRF & DNS Rebinding Protection Helper

Create a utility to validate IP addresses and resolve hosts safely to protect the worker against SSRF and DNS Rebinding.

* **File**: `src/shared/utils/ssrf.ts`
* **Content**:
```typescript
import dns from 'dns';
import { promisify } from 'util';

const dnsLookup = promisify(dns.lookup);

/**
 * Checks if an IP address is inside private CIDR blocks.
 * Supports allowing private IPs via environment variable for local testing.
 */
export function isPrivateIP(ip: string): boolean {
  if (process.env.ALLOW_PRIVATE_IPS === 'true') {
    return false;
  }

  // Check IPv4 private networks:
  // - 127.0.0.0/8 (Loopback)
  // - 10.0.0.0/8 (Private Network)
  // - 172.16.0.0/12 (Private Network)
  // - 192.168.0.0/16 (Private Network)
  // - 169.254.0.0/16 (Link-Local, AWS/GCP metadata)
  // - 0.0.0.0/8 (Local broadcast)
  const ipv4Regex = /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/;
  const match = ip.match(ipv4Regex);
  
  if (match) {
    const o1 = parseInt(match[1], 10);
    const o2 = parseInt(match[2], 10);
    const o3 = parseInt(match[3], 10);
    const o4 = parseInt(match[4], 10);

    if (o1 === 127) return true;
    if (o1 === 10) return true;
    if (o1 === 172 && o2 >= 16 && o2 <= 31) return true;
    if (o1 === 192 && o2 === 168) return true;
    if (o1 === 169 && o2 === 254) return true;
    if (o1 === 0) return true;
    
    return false;
  }

  // Check IPv6 private networks:
  // - ::1 (Loopback)
  // - fe80::/10 (Link-Local)
  // - fc00::/7 (Unique Local)
  const normalizedIp = ip.toLowerCase();
  if (normalizedIp === '::1' || normalizedIp === '0:0:0:0:0:0:0:1') return true;
  if (normalizedIp.startsWith('fe80:')) return true;
  if (normalizedIp.startsWith('fc00:') || normalizedIp.startsWith('fd00:')) return true;

  return false;
}

/**
 * Resolves a hostname to an IP and validates it isn't private.
 */
export async function resolveAndValidateHost(host: string): Promise<string> {
  try {
    const { address } = await dnsLookup(host);
    if (isPrivateIP(address)) {
      throw new Error(`SSRF Prevention: Resolved IP ${address} for host ${host} is in a private network range.`);
    }
    return address;
  } catch (err: any) {
    throw new Error(`DNS Resolution failed for host ${host}: ${err.message}`);
  }
}
```

---

## ⚙️ Step 3.2: Implement the Worker Engine

Implement the `Worker` class which continuously polls the queue, checks concurrency limits, resolves targets safely, runs HTTP requests, and updates job states.

* **File**: `src/core/worker/worker.ts`
* **Content**:
```typescript
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
```

---

## 🏃 Step 3.3: Create a Worker Verification Script

Create a script that starts a mock HTTP server with success, failure, and timeout endpoints, enqueues matching jobs, runs a worker, and checks the results.

* **File**: `src/scratch/test-worker.ts`
* **Content**:
```typescript
import express from 'express';
import { DatabaseQueue } from '../core/queue/database-queue';
import { Worker } from '../core/worker/worker';
import { prisma } from '../db/client';

async function run() {
  // Allow loopback IPs for testing
  process.env.ALLOW_PRIVATE_IPS = 'true';

  const app = express();
  app.use(express.json());

  app.post('/webhook/success', (req, res) => {
    console.log(`[Mock Server] Received success webhook with body:`, req.body);
    res.status(200).json({ status: 'delivered' });
  });

  app.post('/webhook/fail', (req, res) => {
    console.log(`[Mock Server] Received fail webhook, returning 500.`);
    res.status(500).send('Internal Server Error');
  });

  app.post('/webhook/timeout', (req, res) => {
    console.log(`[Mock Server] Received timeout webhook, holding response...`);
    // Never respond to trigger timeout
  });

  const server = app.listen(3030, async () => {
    console.log('[Mock Server] Listening on port 3030');

    const queue = new DatabaseQueue();
    const worker = new Worker('test-worker-1', { concurrency: 2, pollIntervalMs: 500 });

    console.log('\n--- Cleaning Database ---');
    await prisma.jobExecution.deleteMany();
    await prisma.job.deleteMany();

    console.log('\n--- Enqueuing Test Jobs ---');

    // 1. Success Webhook
    const j1 = await queue.enqueue('http.request', {
      url: 'http://localhost:3030/webhook/success',
      method: 'POST',
      body: { event: 'user.created', id: 'usr_123' },
    });

    // 2. Failing Webhook
    const j2 = await queue.enqueue('http.request', {
      url: 'http://localhost:3030/webhook/fail',
      method: 'POST',
    });

    // 3. Timeout Webhook (set timeout to 2000ms)
    const j3 = await queue.enqueue('http.request', {
      url: 'http://localhost:3030/webhook/timeout',
      method: 'POST',
    }, { timeout: 2000 });

    // 4. SSRF Webhook (bypass ALLOW_PRIVATE_IPS for this specific check to see if it blocks)
    const j4 = await queue.enqueue('http.request', {
      url: 'http://localhost:3030/webhook/success',
      method: 'POST',
    });

    console.log(`Enqueued Jobs: \n- Success: ${j1.id}\n- Fail: ${j2.id}\n- Timeout: ${j3.id}\n- SSRF Check: ${j4.id}\n`);

    // Start Worker
    worker.start();

    // Trigger SSRF checking by disabling ALLOW_PRIVATE_IPS after a short delay
    setTimeout(() => {
      process.env.ALLOW_PRIVATE_IPS = 'false';
    }, 1200);

    // Let the worker process for 5 seconds
    setTimeout(async () => {
      console.log('\n--- Shutting Down ---');
      worker.stop();
      server.close(async () => {
        console.log('[Mock Server] Closed.');

        const jobs = await prisma.job.findMany({
          include: { executions: true },
        });

        console.log('\n--- Final Job States in Database ---');
        for (const j of jobs) {
          console.log(`Job ${j.id} (url: ${(j.payload as any).url}):`);
          console.log(`  State: ${j.state}`);
          console.log(`  Attempts: ${j.retriesCount}/${j.maxRetries}`);
          for (const exec of j.executions) {
            console.log(`    - Attempt ${exec.attempt}: State=${exec.state}, Status=${exec.statusCode}, Error=${exec.error || 'None'}`);
          }
        }

        await prisma.$disconnect();
        process.exit(0);
      });
    }, 6000);
  });
}

run().catch((err) => {
  console.error('Error running test script:', err);
  process.exit(1);
});
```

---

## 🚪 Step 3.4: Configure the Unified Process Entrypoint

Create the primary process bootstrapper that starts the correct node behavior (API Server, Worker, or Scheduler) based on environment configuration.

* **File**: `src/index.ts`
* **Content**:
```typescript
import dotenv from 'dotenv';
dotenv.config();

import { Worker } from './core/worker/worker';

async function main() {
  const role = process.env.PROCESS_ROLE || 'worker';
  const workerId = process.env.WORKER_ID || `worker-${Math.random().toString(36).substring(2, 9)}`;

  console.log(`[System Boot] Starting application in role: ${role}`);

  if (role === 'worker') {
    const concurrency = process.env.WORKER_CONCURRENCY 
      ? parseInt(process.env.WORKER_CONCURRENCY, 10) 
      : 5;
    const pollIntervalMs = process.env.WORKER_POLL_INTERVAL
      ? parseInt(process.env.WORKER_POLL_INTERVAL, 10)
      : 1000;

    const worker = new Worker(workerId, { concurrency, pollIntervalMs });
    worker.start();

    // Handle graceful shutdown
    const shutdown = () => {
      console.log('[System Boot] Shutting down worker...');
      worker.stop();
      process.exit(0);
    };

    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);

  } else if (role === 'api') {
    console.log('[System Boot] API Server starting (placeholder)...');
    // We will initialize Express API Server here in Milestone 6
    require('./server');
  } else {
    console.error(`[System Boot] Unknown PROCESS_ROLE: ${role}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('[System Boot] Fatal startup error:', err);
  process.exit(1);
});
```

---

## 🧪 Step 3.5: Run Verification

Run the test worker script locally to verify correct concurrency, HTTP calls, Abort timeouts, and SSRF prevention.

1. Execute the test runner:
   ```bash
   npx ts-node src/scratch/test-worker.ts
   ```

2. Verify:
   - Success webhook completes with HTTP 200.
   - Fail webhook fails with HTTP 500 and schedules a retry.
   - Timeout webhook aborts after 2000ms.
   - SSRF check webhook fails with SSRF Prevention error after the environment variable is toggled.
