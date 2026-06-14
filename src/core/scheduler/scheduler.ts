import { JobState } from "@prisma/client"
import { prisma } from "../../db/client"

export class Scheduler {
    private isRunning=false
    private timer:NodeJS.Timeout|null=null
    constructor(private pollIntervalMs=1000){}
    start():void{
        if(this.isRunning) return
        console.log("daemon started")
        this.isRunning=true
        this.tick()
    }

    stop(){
        this.isRunning=false;
        if(this.timer) clearTimeout(this.timer)
    }

    private async tick(){
        if(!this.isRunning) return;
        try {
            await this.promotePendingJobs()
        } catch (error) {
            console.error(error)
        }
        this.timer=setTimeout(()=>{
            this.tick()
        },this.pollIntervalMs)
    }

    private async promotePendingJobs(){
        const result=await prisma.job.updateMany({
            where:{
                state:JobState.PENDING,
                runAt:{
                    lte:new Date()
                }
            },
            data:{
                state:JobState.QUEUED
            }
        })
        if(result?.count>0){
            console.log(`Scheduler promotes ${result.count} jobs`)
        }
    }
}