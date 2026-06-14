import { DatabaseQueue } from '../core/queue/database-queue';
import { prisma } from '../db/client';

async function run() {
  const queue = new DatabaseQueue();
  const worker1 = 'worker-node-1';
  const worker2 = 'worker-node-2';

  console.log('--- Cleaning old jobs ---');
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

  console.log('\n--- Enqueuing HTTP Jobs ---');
  
  // Immediate high priority job
  const job1 = await queue.enqueue(
    user.id,
    'http.request',
    { url: 'https://httpbin.org/post', method: 'POST', body: { orderId: 101 } },
    { priority: 20 },
  );
  console.log(`Enqueued High Priority Job: ${job1.id} (priority: ${job1.priority})`);

  // Immediate low priority job
  const job2 = await queue.enqueue(
    user.id,
    'http.request',
    { url: 'https://httpbin.org/get', method: 'GET' },
    { priority: 5 },
  );
  console.log(`Enqueued Low Priority Job: ${job2.id} (priority: ${job2.priority})`);

  console.log('\n--- Verifying Row Lock Concurrency ---');
  
  // Worker 1 fetches the first job
  const activeJob1 = await queue.fetchNextJob(worker1);
  console.log(`[Worker 1] Locked Job: ${activeJob1?.id} (expect Job 101 - Priority 20)`);

  // Worker 2 fetches at the same time. It should skip Locked Job 101 and grab Job 102 (Priority 5)
  const activeJob2 = await queue.fetchNextJob(worker2);
  console.log(`[Worker 2] Locked Job: ${activeJob2?.id} (expect Job 102 - Priority 5)`);

  console.log('\n--- Processing and Logging Attempts ---');
  
  if (activeJob1) {
    console.log(`[Worker 1] Completing Job: ${activeJob1.id}...`);
    await queue.completeJob(activeJob1.id, worker1, 201, '{"success": true}');
    console.log(`[Worker 1] Job ${activeJob1.id} Completed.`);
  }

  if (activeJob2) {
    console.log(`[Worker 2] Failing Job (Retry 1): ${activeJob2.id}...`);
    // Simulate failure
    await queue.failJob(activeJob2.id, worker2, 'Connection timeout', 504, 'Gateway Timeout');
    
    // Look up retry details
    const retriedJob = await prisma.job.findUnique({ where: { id: activeJob2.id } });
    console.log(
      `[Worker 2] Job Retried. Current state: ${retriedJob?.state}, retries: ${retriedJob?.retriesCount}/${retriedJob?.maxRetries}, next run_at: ${retriedJob?.runAt.toISOString()}`,
    );
  }
}

run()
  .catch((err) => console.error('Error during test runner execution:', err))
  .finally(() => prisma.$disconnect());
