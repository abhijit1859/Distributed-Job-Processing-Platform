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
exports.Worker = void 0;
const database_queue_1 = require("../queue/database-queue");
class Worker {
    constructor(workerId, options = {}) {
        var _a, _b;
        this.activeJobsCount = 0;
        this.isRunning = false;
        this.timer = null;
        this.queue = new database_queue_1.DatabaseQueue();
        this.workerId = workerId;
        this.concurrency = (_a = options.concurrency) !== null && _a !== void 0 ? _a : 5;
        this.pollIntervalMs = (_b = options.pollIntervalMs) !== null && _b !== void 0 ? _b : 1000;
    }
    start() {
        console.log("started");
        if (this.isRunning)
            return;
        this.isRunning = true;
        console.log(`[Worker ${this.workerId}] Starting with concurrency limit ${this.concurrency}...`);
        this.tick();
    }
    stop() {
        this.isRunning = false;
        if (this.timer) {
            clearTimeout(this.timer);
            this.timer = null;
        }
        console.log(`[Worker ${this.workerId}] Stopped worker.`);
    }
    tick() {
        console.log("hello");
        if (!this.isRunning)
            return;
        this.pollAndExecute()
            .catch((err) => console.error(`[Worker ${this.workerId}] Error in poll cycle:`, err))
            .finally(() => {
            if (this.isRunning) {
                this.timer = setTimeout(() => this.tick(), this.pollIntervalMs);
            }
        });
    }
    pollAndExecute() {
        return __awaiter(this, void 0, void 0, function* () {
            console.log("polling....");
            while (this.activeJobsCount < this.concurrency && this.isRunning) {
                const job = yield this.queue.fetchNextJob(this.workerId);
                if (!job) {
                    console.log("no job");
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
        });
    }
    runJob(job) {
        return __awaiter(this, void 0, void 0, function* () {
            console.log(`[Worker ${this.workerId}] Executing job ${job.id} (name: ${job.name})...`);
            try {
                const delay = Math.floor(Math.random() * 5000) + 1000;
                yield new Promise((resolve) => setTimeout(resolve, delay));
                if (Math.random() < 0.2) {
                    throw new Error("Execution failed");
                }
                yield this.queue.completeJob(job.id, this.workerId);
                console.log(`[Worker ${this.workerId}] Completed ${job.id}`);
            }
            catch (error) {
                console.error(error);
                yield this.queue.failJob(job.id, this.workerId, error instanceof Error ? error.message : "Unknown error");
            }
        });
    }
}
exports.Worker = Worker;
