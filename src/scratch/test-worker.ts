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
    await prisma.user.deleteMany();

    const user = await prisma.user.create({
      data: {
        name: 'Test User',
        email: 'test@example.com',
        password: 'password123',
      },
    });

    console.log('\n--- Enqueuing Test Jobs ---');

    // 1. Success Webhook
    const j1 = await queue.enqueue(user.id, 'http.request', {
      url: 'http://localhost:3030/webhook/success',
      method: 'POST',
      body: { event: 'user.created', id: 'usr_123' },
    });

    // 2. Failing Webhook
    const j2 = await queue.enqueue(user.id, 'http.request', {
      url: 'http://localhost:3030/webhook/fail',
      method: 'POST',
    });

    // 3. Timeout Webhook (set timeout to 2000ms)
    const j3 = await queue.enqueue(user.id, 'http.request', {
      url: 'http://localhost:3030/webhook/timeout',
      method: 'POST',
    }, { timeout: 2000 });

    // 4. SSRF Webhook (bypass ALLOW_PRIVATE_IPS for this specific check to see if it blocks)
    const j4 = await queue.enqueue(user.id, 'http.request', {
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
