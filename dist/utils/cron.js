"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getNextCronRun = getNextCronRun;
const cron_parser_1 = __importDefault(require("cron-parser"));
function getNextCronRun(cronExpression, currentDate = new Date()) {
    const interval = cron_parser_1.default.parse(cronExpression, { currentDate });
    return interval.next().toDate();
}
