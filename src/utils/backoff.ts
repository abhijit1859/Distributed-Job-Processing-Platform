import { BackoffType } from "@prisma/client";

export function calculateNextRun(retriesCount:number,backoffType:BackoffType,backoffDelayMs:number):Date{
  const now=Date.now()
  if(backoffType===BackoffType.FIXED){
    return new Date(now+backoffDelayMs)
  }
  const exponent=Math.max(0,retriesCount-1)
  const delay=backoffDelayMs*Math.pow(2,exponent)

  return new Date(now+delay)
}