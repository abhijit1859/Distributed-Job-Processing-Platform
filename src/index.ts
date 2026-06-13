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
