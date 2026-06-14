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
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const worker_1 = require("./core/worker/worker");
function main() {
    return __awaiter(this, void 0, void 0, function* () {
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
            const worker = new worker_1.Worker(workerId, { concurrency, pollIntervalMs });
            worker.start();
            // Handle graceful shutdown
            const shutdown = () => {
                console.log('[System Boot] Shutting down worker...');
                worker.stop();
                process.exit(0);
            };
            process.on('SIGTERM', shutdown);
            process.on('SIGINT', shutdown);
        }
        else if (role === 'api') {
            console.log('[System Boot] API Server starting (placeholder)...');
            // We will initialize Express API Server here in Milestone 6
            require('./server');
        }
        else {
            console.error(`[System Boot] Unknown PROCESS_ROLE: ${role}`);
            process.exit(1);
        }
    });
}
main().catch((err) => {
    console.error('[System Boot] Fatal startup error:', err);
    process.exit(1);
});
