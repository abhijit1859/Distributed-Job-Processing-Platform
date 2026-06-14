"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.calculateNextRun = calculateNextRun;
const client_1 = require("@prisma/client");
function calculateNextRun(retriesCount, backoffType, backoffDelayMs) {
    const now = Date.now();
    if (backoffType === client_1.BackoffType.FIXED) {
        return new Date(now + backoffDelayMs);
    }
    const exponent = Math.max(0, retriesCount - 1);
    const delay = backoffDelayMs * Math.pow(2, exponent);
    return new Date(now + delay);
}
