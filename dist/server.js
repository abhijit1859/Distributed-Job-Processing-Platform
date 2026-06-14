"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const express_1 = __importDefault(require("express"));
const job_routes_1 = __importDefault(require("./api/routes/job-routes"));
const worker_1 = require("./core/worker/worker");
const scheduler_1 = require("./core/scheduler/scheduler");
const app = (0, express_1.default)();
app.use(express_1.default.json());
app.use("/", job_routes_1.default);
const workerId = `worker-inline-${Math.random().toString(36).substring(2, 9)}`;
app.listen(3000, () => {
    console.log("server is up and running");
});
new scheduler_1.Scheduler().start();
new worker_1.Worker(workerId).start();
