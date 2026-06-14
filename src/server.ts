import dotenv from "dotenv"
dotenv.config()

import express from "express"
import jobRoutes from "./api/routes/job-routes"
import authRoutes from "./api/routes/auth-routes"
import { Worker } from "./core/worker/worker"
import { Scheduler } from "./core/scheduler/scheduler"


const app=express()
app.use(express.json())
app.use("/", authRoutes)
app.use("/", jobRoutes)

const workerId = `worker-inline-${Math.random().toString(36).substring(2, 9)}`;

 
app.listen(3000,()=>{
    console.log("server is up and running")
})

new Scheduler().start()
new Worker(workerId).start();