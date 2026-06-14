import CronExpressionParser from "cron-parser";

export function getNextCronRun(cronExpression: string, currentDate = new Date()): Date{
    const interval=CronExpressionParser.parse(cronExpression,{currentDate})
    return interval.next().toDate()

}