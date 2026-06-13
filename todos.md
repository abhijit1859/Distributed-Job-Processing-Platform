# Project Action Item Checklist

This document tracks our implementation progress.

---

## 📅 Milestone 1: Project Setup & DB Schema (COMPLETED)
- [x] Initialize `package.json` with dependency list.
- [x] Setup TypeScript configuration (`tsconfig.json`).
- [x] Configure `docker-compose.yml` to launch a local PostgreSQL container.
- [x] Verify that PostgreSQL starts successfully with a health check.
- [x] Initialize Prisma in the project (`npx prisma init`).
- [x] Define `Job` and `JobExecution` models in `prisma/schema.prisma`.
- [x] Add the compound index `idx_jobs_state_run_at_priority` in the schema.
- [x] Generate the initial SQL migration file using Prisma.
- [x] Run the migration to apply changes to the local PostgreSQL database.
- [x] Create `src/db/client.ts` to export a single, shared Prisma client instance.
- [x] Configure `package.json` scripts (`npm run dev`, `npm run db:migrate`, etc.).

---

## 📅 Milestone 2: Database Queue Core & Lock Mechanics (COMPLETED)
- [x] Create directory structure `src/shared/utils`, `src/core/queue`, and `src/scratch`.
- [x] Create `src/shared/utils/backoff.ts` and implement exponential and fixed retry delay logic.
- [x] Create `src/core/queue/database-queue.ts` and implement the `DatabaseQueue` class.
- [x] Write the raw SQL atomic queue lock-and-update query using `SELECT FOR UPDATE SKIP LOCKED` inside `fetchNextJob`.
- [x] Write transactional logic for `completeJob` to mark success and log executions.
- [x] Write transactional logic for `failJob` to handle attempts, backoffs, status loggings, and DLQ routing.
- [x] Write verification script `src/scratch/test-queue.ts`.
- [x] Execute `npx ts-node src/scratch/test-queue.ts` and verify lock acquisition and execution logs.

---

## 📅 Milestone 3: Worker Engine & Concurrency Control (COMPLETED)
- [x] Create `src/shared/utils/ssrf.ts` to implement DNS resolution and private IP validation (SSRF/DNS Rebinding protection).
- [x] Create `src/core/worker/worker.ts` and implement the `Worker` class with job execution and concurrency limits.
- [x] Implement safe HTTP client execution in `Worker` using native `fetch` with AbortController timeouts and Host/X-Job-Id headers.
- [x] Create `src/scratch/test-worker.ts` to run a mock local HTTP server and verify worker polling, concurrency limits, execution success, retries, and SSRF blocking.
- [x] Create `src/index.ts` to serve as the unified entrypoint that boots the process based on `PROCESS_ROLE` environment variable.

---

## 📅 Milestone 4: Scheduler & Recurring (Cron) Jobs (IN PROGRESS)
- [ ] Create `src/shared/utils/cron.ts` to parse standard cron expressions and calculate next execution schedules.
- [ ] Create `src/core/scheduler/scheduler.ts` and implement the `Scheduler` daemon polling loop.
- [ ] Write transactional scheduler query to grab scheduled ready jobs (runAt <= NOW) and move them to `QUEUED`.
- [ ] Implement recurring (cron) job scheduling logic: when a cron job completes/fails, schedule its next run based on the cron expression.
- [ ] Create verification script `src/scratch/test-scheduler.ts` and run it to verify delayed and cron jobs execution.
- [ ] Integrate Scheduler startup into unified process entrypoint `src/index.ts` under role `'scheduler'`.
