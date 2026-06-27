import client from "prom-client"

const register=new client.Registry()


client.collectDefaultMetrics({
    register
})



export const queuedJobsGauge=new client.Gauge({
    name:"queue_jobs_total",
    help:"Number of jobs waiting in queue"
})

export const processedcounter=new client.Counter({
    name:"jobs_processed_total",
    help:"Total jobs processed"
})

export const jobFailureCounter=new client.Counter({
    name:"job_failures_total",
    help:"total failed jobs"
})

export const jobDurationHistogram = new client.Histogram({
  name: "job_execution_duration_seconds",
  help: "Duration of job execution",
  buckets: [0.1, 0.5, 1, 2, 5, 10],
});

export const activeWorkersGauge = new client.Gauge({
  name: "worker_active_jobs",
  help: "Current active jobs being processed",
});


register.registerMetric(queuedJobsGauge);
register.registerMetric(processedcounter);
register.registerMetric(jobFailureCounter);
register.registerMetric(jobDurationHistogram);
register.registerMetric(activeWorkersGauge);

export default register;