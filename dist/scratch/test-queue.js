"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const database_queue_1 = require("../core/queue/database-queue");
const client_1 = require("../db/client");
function run() {
    return __awaiter(this, void 0, void 0, function* () {
        const queue = new database_queue_1.DatabaseQueue();
        const worker1 = 'worker-node-1';
        const worker2 = 'worker-node-2';
        console.log('--- Cleaning old jobs ---');
        yield client_1.prisma.jobExecution.deleteMany();
        yield client_1.prisma.job.deleteMany();
        console.log('\n--- Enqueuing HTTP Jobs ---');
        // Immediate high priority job
        const job1 = yield queue.enqueue('http.request', { url: 'https://httpbin.org/post', method: 'POST', body: { orderId: 101 } }, { priority: 20 });
        console.log(`Enqueued High Priority Job: ${job1.id} (priority: ${job1.priority})`);
        // Immediate low priority job
        const job2 = yield queue.enqueue('http.request', { url: 'https://httpbin.org/get', method: 'GET' }, { priority: 5 });
        console.log(`Enqueued Low Priority Job: ${job2.id} (priority: ${job2.priority})`);
        console.log('\n--- Verifying Row Lock Concurrency ---');
        // Worker 1 fetches the first job
        const activeJob1 = yield queue.fetchNextJob(worker1);
        console.log(`[Worker 1] Locked Job: ${activeJob1 === null || activeJob1 === void 0 ? void 0 : activeJob1.id} (expect Job 101 - Priority 20)`);
        // Worker 2 fetches at the same time. It should skip Locked Job 101 and grab Job 102 (Priority 5)
        const activeJob2 = yield queue.fetchNextJob(worker2);
        console.log(`[Worker 2] Locked Job: ${activeJob2 === null || activeJob2 === void 0 ? void 0 : activeJob2.id} (expect Job 102 - Priority 5)`);
        console.log('\n--- Processing and Logging Attempts ---');
        if (activeJob1) {
            console.log(`[Worker 1] Completing Job: ${activeJob1.id}...`);
            yield queue.completeJob(activeJob1.id, worker1, 201, '{"success": true}');
            console.log(`[Worker 1] Job ${activeJob1.id} Completed.`);
        }
        if (activeJob2) {
            console.log(`[Worker 2] Failing Job (Retry 1): ${activeJob2.id}...`);
            // Simulate failure
            yield queue.failJob(activeJob2.id, worker2, 'Connection timeout', 504, 'Gateway Timeout');
            // Look up retry details
            const retriedJob = yield client_1.prisma.job.findUnique({ where: { id: activeJob2.id } });
            console.log(`[Worker 2] Job Retried. Current state: ${retriedJob === null || retriedJob === void 0 ? void 0 : retriedJob.state}, retries: ${retriedJob === null || retriedJob === void 0 ? void 0 : retriedJob.retriesCount}/${retriedJob === null || retriedJob === void 0 ? void 0 : retriedJob.maxRetries}, next run_at: ${retriedJob === null || retriedJob === void 0 ? void 0 : retriedJob.runAt.toISOString()}`);
        }
    });
}
run()
    .catch((err) => console.error('Error during test runner execution:', err))
    .finally(() => client_1.prisma.$disconnect());
