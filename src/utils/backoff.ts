import { BackoffType } from "@prisma/client";

export function calculateNextRun(retriesCount:number,backoffType:BackoffType,backoffDelayMs:number):Date{
  const now=Date.now()
  
  let delay=backoffDelayMs
   
  if(backoffType===BackoffType.EXPONENTIAL){
    const exponent=Math.max(0,retriesCount-1)
    delay=backoffDelayMs*Math.pow(2,exponent)
  }
  const jitterRange=delay*0.15
  const randomJitter=(Math.random()*2-1)*jitterRange

  const finalDelay=Math.max(0,delay+randomJitter)
  return new Date(now+finalDelay)
}