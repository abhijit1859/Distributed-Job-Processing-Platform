-- CreateEnum
CREATE TYPE "JobState" AS ENUM ('RUNNING', 'QUEUED', 'PENDING', 'COMPLETED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "BackoffType" AS ENUM ('FIXED', 'EXPONENTIAL');

-- CreateTable
CREATE TABLE "jobs" (
    "id" UUID NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "state" "JobState" NOT NULL DEFAULT 'PENDING',
    "priority" INTEGER NOT NULL DEFAULT 10,
    "run_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "max_retries" INTEGER NOT NULL DEFAULT 3,
    "retries_count" INTEGER NOT NULL DEFAULT 0,
    "backoff_type" "BackoffType" NOT NULL DEFAULT 'FIXED',
    "backoff_delay" INTEGER NOT NULL DEFAULT 1000,
    "cron_expression" TEXT,
    "locked_at" TIMESTAMP(3),
    "locked_by" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_executions" (
    "id" UUID NOT NULL,
    "job_id" UUID NOT NULL,
    "worker_id" VARCHAR(255) NOT NULL,
    "attempt" INTEGER NOT NULL,
    "state" "JobState" NOT NULL,
    "status_code" INTEGER,
    "response_body" TEXT,
    "started_at" TIMESTAMP(3) NOT NULL,
    "finished_at" TIMESTAMP(3),
    "error" TEXT,
    "stack_trace" TEXT,

    CONSTRAINT "job_executions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_jobs_state_run_at_priority" ON "jobs"("state", "run_at", "priority" DESC);

-- CreateIndex
CREATE INDEX "idex_jobs_cron_expression" ON "jobs"("cron_expression");

-- CreateIndex
CREATE INDEX "idx_job_executions_job_id" ON "job_executions"("job_id");

-- AddForeignKey
ALTER TABLE "job_executions" ADD CONSTRAINT "job_executions_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
