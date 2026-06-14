import dotenv from "dotenv"
dotenv.config()

import express from "express"
import jobRoutes from "./api/routes/job-routes"
import { Worker } from "./core/worker/worker"


const app=express()
app.use(express.json())
app.use("/",jobRoutes)

const workerId = `worker-inline-${Math.random().toString(36).substring(2, 9)}`;
const worker=new Worker(workerId)

worker.start()
app.listen(3000,()=>{
    console.log("server is up and running")
})