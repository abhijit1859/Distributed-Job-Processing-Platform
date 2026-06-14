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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const database_queue_1 = require("../core/queue/database-queue");
const worker_1 = require("../core/worker/worker");
const client_1 = require("../db/client");
function run() {
    return __awaiter(this, void 0, void 0, function* () {
        // Allow loopback IPs for testing
        process.env.ALLOW_PRIVATE_IPS = 'true';
        const app = (0, express_1.default)();
        app.use(express_1.default.json());
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
        const server = app.listen(3030, () => __awaiter(this, void 0, void 0, function* () {
            console.log('[Mock Server] Listening on port 3030');
            const queue = new database_queue_1.DatabaseQueue();
            const worker = new worker_1.Worker('test-worker-1', { concurrency: 2, pollIntervalMs: 500 });
            console.log('\n--- Cleaning Database ---');
            yield client_1.prisma.jobExecution.deleteMany();
            yield client_1.prisma.job.deleteMany();
            console.log('\n--- Enqueuing Test Jobs ---');
            // 1. Success Webhook
            const j1 = yield queue.enqueue('http.request', {
                url: 'http://localhost:3030/webhook/success',
                method: 'POST',
                body: { event: 'user.created', id: 'usr_123' },
            });
            // 2. Failing Webhook
            const j2 = yield queue.enqueue('http.request', {
                url: 'http://localhost:3030/webhook/fail',
                method: 'POST',
            });
            // 3. Timeout Webhook (set timeout to 2000ms)
            const j3 = yield queue.enqueue('http.request', {
                url: 'http://localhost:3030/webhook/timeout',
                method: 'POST',
            }, { timeout: 2000 });
            // 4. SSRF Webhook (bypass ALLOW_PRIVATE_IPS for this specific check to see if it blocks)
            const j4 = yield queue.enqueue('http.request', {
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
            setTimeout(() => __awaiter(this, void 0, void 0, function* () {
                console.log('\n--- Shutting Down ---');
                worker.stop();
                server.close(() => __awaiter(this, void 0, void 0, function* () {
                    console.log('[Mock Server] Closed.');
                    const jobs = yield client_1.prisma.job.findMany({
                        include: { executions: true },
                    });
                    console.log('\n--- Final Job States in Database ---');
                    for (const j of jobs) {
                        console.log(`Job ${j.id} (url: ${j.payload.url}):`);
                        console.log(`  State: ${j.state}`);
                        console.log(`  Attempts: ${j.retriesCount}/${j.maxRetries}`);
                        for (const exec of j.executions) {
                            console.log(`    - Attempt ${exec.attempt}: State=${exec.state}, Status=${exec.statusCode}, Error=${exec.error || 'None'}`);
                        }
                    }
                    yield client_1.prisma.$disconnect();
                    process.exit(0);
                }));
            }), 6000);
        }));
    });
}
run().catch((err) => {
    console.error('Error running test script:', err);
    process.exit(1);
});
