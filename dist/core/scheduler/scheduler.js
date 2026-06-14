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
exports.Scheduler = void 0;
const client_1 = require("@prisma/client");
const client_2 = require("../../db/client");
class Scheduler {
    constructor(pollIntervalMs = 1000) {
        this.pollIntervalMs = pollIntervalMs;
        this.isRunning = false;
        this.timer = null;
    }
    start() {
        if (this.isRunning)
            return;
        console.log("daemon started");
        this.isRunning = true;
        this.tick();
    }
    stop() {
        this.isRunning = false;
        if (this.timer)
            clearTimeout(this.timer);
    }
    tick() {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this.isRunning)
                return;
            try {
                yield this.promotePendingJobs();
            }
            catch (error) {
                console.error(error);
            }
            this.timer = setTimeout(() => {
                this.tick();
            }, this.pollIntervalMs);
        });
    }
    promotePendingJobs() {
        return __awaiter(this, void 0, void 0, function* () {
            const result = yield client_2.prisma.job.updateMany({
                where: {
                    state: client_1.JobState.PENDING,
                    runAt: {
                        lte: new Date()
                    }
                },
                data: {
                    state: client_1.JobState.QUEUED
                }
            });
            if ((result === null || result === void 0 ? void 0 : result.count) > 0) {
                console.log(`Scheduler promotes ${result.count} jobs`);
            }
        });
    }
}
exports.Scheduler = Scheduler;
