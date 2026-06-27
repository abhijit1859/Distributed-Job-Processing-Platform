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

## 📅 Milestone 3: Worker Engine & Concurrency Control (IN PROGRESS)
- [x] Create `src/shared/utils/ssrf.ts` to implement DNS resolution and private IP validation (SSRF/DNS Rebinding protection).
- [x] Create `src/core/worker/worker.ts` and implement the `Worker` class with job execution and concurrency limits.
- [x] Implement safe HTTP client execution in `Worker` using native `fetch` with AbortController timeouts and Host/X-Job-Id headers.
- [x] Create `src/scratch/test-worker.ts` to run a mock local HTTP server and verify worker polling, concurrency limits, execution success, retries, and SSRF blocking.
- [x] Create `src/index.ts` to serve as the unified entrypoint that boots the process based on `PROCESS_ROLE` environment variable.
- [ ] Implement recurring (cron) job scheduling logic: when a cron job completes/fails, schedule its next run based on the cron expression.

---

## 📅 Milestone 4: Scheduler & Recurring (Cron) Jobs (IN PROGRESS)
- [x] Create `src/utils/cron.ts` to parse standard cron expressions and calculate next execution schedules.
- [x] Refactor and fix existing scheduler implementation in `src/core/scheduler/scheduler.ts`:
  - [x] Fix the `start()` early return check logic (currently returns when *not* running instead of when running).
  - [x] Implement the recurring execution loop inside `tick()` using `setTimeout`.
  - [x] Add `pollIntervalMs` parameter configuration via the constructor or configuration options.
  - [x] Fix the spelling typo of `isRunninng` to `isRunning`.
  - [x] Log the number of promoted pending jobs using the returned count from Prisma's `updateMany`.
- [x] Write transactional scheduler query to grab scheduled ready jobs (runAt <= NOW) and move them to `QUEUED`.
- [ ] Create verification script `src/scratch/test-scheduler.ts` and run it to verify delayed and cron jobs execution.
- [ ] Integrate Scheduler startup into unified process entrypoint `src/index.ts` under role `'scheduler'`.

---

## 📅 Milestone 5: Error Handling & DLQ (IN PROGRESS)
- [ ] Update [backoff.ts](file:///home/abhijit_1859/Documents/learn-codes/distri/src/utils/backoff.ts) to add random jitter to exponential retries.
- [x] Ensure standard (non-cron) jobs transitioning to the `FAILED` state are handled as a Dead Letter Queue (DLQ).

---

## 📅 Milestone 6: REST API Authentication & Cancellation (IN PROGRESS)
- [x] Secure all job endpoints in [job-routes.ts](file:///home/abhijit_1859/Documents/learn-codes/distri/src/api/routes/job-routes.ts) using JWT and Role-Based Access Control (RBAC).
- [x] Implement signup, login, and logout endpoints in [auth-controller.ts](file:///home/abhijit_1859/Documents/learn-codes/distri/src/api/controllers/auth-controller.ts) using password hashing (`bcryptjs`) and stateless token signing (`jsonwebtoken`).
- [ ] Write the controller logic for `cancelJob` inside [job-controller.ts](file:///home/abhijit_1859/Documents/learn-codes/distri/src/api/controllers/job-controller.ts) to transition `PENDING` or `QUEUED` jobs to the `CANCELLED` state.
