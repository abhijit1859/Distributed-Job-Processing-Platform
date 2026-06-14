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
exports.DatabaseQueue = void 0;
const client_1 = require("../../db/client");
const client_2 = require("@prisma/client");
const backoff_1 = require("../../utils/backoff");
const cron_1 = require("../../utils/cron");
class DatabaseQueue {
    enqueue(name_1, payload_1) {
        return __awaiter(this, arguments, void 0, function* (name, payload, options = {}) {
            var _a, _b, _c, _d, _e, _f;
            return client_1.prisma.job.create({
                data: {
                    name,
                    payload: payload,
                    priority: (_a = options.priority) !== null && _a !== void 0 ? _a : 10,
                    runAt: (_b = options.runAt) !== null && _b !== void 0 ? _b : new Date(),
                    maxRetries: (_c = options.maxRetries) !== null && _c !== void 0 ? _c : 3,
                    backoffType: (_d = options.backoffType) !== null && _d !== void 0 ? _d : client_2.BackoffType.FIXED,
                    backoffDelay: (_e = options.backoffDelay) !== null && _e !== void 0 ? _e : 1000,
                    timeout: (_f = options.timeout) !== null && _f !== void 0 ? _f : 60000,
                    state: options.runAt && options.runAt > new Date() ? client_2.JobState.PENDING : client_2.JobState.QUEUED,
                },
            });
        });
    }
    fetchNextJob(workerId) {
        return __awaiter(this, void 0, void 0, function* () {
            const result = yield client_1.prisma.$queryRawUnsafe(`
      UPDATE "jobs"
      SET 
        "state" = 'RUNNING'::"JobState",
        "locked_at" = NOW(),
        "locked_by" = $1
      WHERE "id" = (
        SELECT "id" FROM "jobs"
        WHERE "state" = 'QUEUED' AND "run_at" <= NOW()
        ORDER BY "priority" DESC, "run_at" ASC
        LIMIT 1
        FOR UPDATE SKIP LOCKED
      )
      RETURNING *;
      `, workerId);
            return result.length > 0 ? result[0] : null;
        });
    }
    completeJob(jobId, workerId, statusCode, responseBody) {
        return __awaiter(this, void 0, void 0, function* () {
            yield client_1.prisma.$transaction((tx) => __awaiter(this, void 0, void 0, function* () {
                const job = yield tx.job.findUnique({
                    where: { id: jobId },
                });
                if (!job)
                    throw new Error(`Job ${jobId} not found`);
                if (job.state !== client_2.JobState.RUNNING) {
                    throw new Error(`Job ${jobId} is not in RUNNING state (current: ${job.state})`);
                }
                if (job.cronExpression) {
                    const nextRun = (0, cron_1.getNextCronRun)(job.cronExpression);
                    yield tx.job.update({
                        where: { id: jobId },
                        data: {
                            state: client_2.JobState.PENDING,
                            runAt: nextRun,
                            retriesCount: 0,
                            lockedAt: null,
                            lockedBy: null
                        }
                    });
                }
                else {
                    yield tx.job.update({
                        where: { id: jobId },
                        data: {
                            state: client_2.JobState.COMPLETED,
                            lockedAt: null,
                            lockedBy: null,
                        },
                    });
                }
                yield tx.jobExecution.create({
                    data: {
                        jobId,
                        workerId,
                        attempt: job.retriesCount + 1,
                        state: client_2.JobState.COMPLETED,
                        statusCode,
                        responseBody,
                        startedAt: job.lockedAt || new Date(),
                        finishedAt: new Date(),
                    },
                });
            }));
        });
    }
    failJob(jobId, workerId, errorMsg, statusCode, responseBody) {
        return __awaiter(this, void 0, void 0, function* () {
            yield client_1.prisma.$transaction((tx) => __awaiter(this, void 0, void 0, function* () {
                const job = yield tx.job.findUnique({
                    where: { id: jobId },
                });
                if (!job)
                    throw new Error(`Job ${jobId} not found`);
                const nextRetryCount = job.retriesCount + 1;
                const canRetry = nextRetryCount <= job.maxRetries;
                const nextState = canRetry ? client_2.JobState.QUEUED : client_2.JobState.FAILED;
                const nextRunAt = canRetry
                    ? (0, backoff_1.calculateNextRun)(nextRetryCount, job.backoffType, job.backoffDelay)
                    : job.runAt;
                yield tx.job.update({
                    where: { id: jobId },
                    data: {
                        state: nextState,
                        retriesCount: nextRetryCount,
                        runAt: nextRunAt,
                        lockedAt: null,
                        lockedBy: null,
                    },
                });
                yield tx.jobExecution.create({
                    data: {
                        jobId,
                        workerId,
                        attempt: nextRetryCount,
                        state: client_2.JobState.FAILED,
                        statusCode,
                        responseBody,
                        startedAt: job.lockedAt || new Date(),
                        finishedAt: new Date(),
                        error: errorMsg,
                    },
                });
            }));
        });
    }
}
exports.DatabaseQueue = DatabaseQueue;
