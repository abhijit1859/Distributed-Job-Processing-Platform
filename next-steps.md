# 🚀 Next Steps Roadmap

This document outlines the immediate next steps to complete the milestones for the **Distributed Job Processing Platform**.

---

## ⏱️ Milestone 3 & 4: Scheduler & Cron Completion
- [ ] **Cron Failure Rescheduling**: Update `failJob` in [database-queue.ts](file:///home/abhijit_1859/Documents/learn-codes/distri/src/core/queue/database-queue.ts) so that if a cron-based job runs out of retries, it is rescheduled as `PENDING` for its next cron occurrence (resets `retriesCount` to `0`) rather than being marked permanently as `FAILED`.
- [ ] **Index Bootstrapper Integration**: Add the `'scheduler'` role startup to [src/index.ts](file:///home/abhijit_1859/Documents/learn-codes/distri/src/index.ts).
- [ ] **Verification Script**: Create `src/scratch/test-scheduler.ts` to spin up a mock server, worker, and scheduler to test delay-based and recurring cron job executions.

---

## ⚠️ Milestone 5: Error Handling & DLQ
- [ ] **Exponential Backoff Jitter**: Update [backoff.ts](file:///home/abhijit_1859/Documents/learn-codes/distri/src/utils/backoff.ts) to add random jitter to exponential retries to prevent concurrent thundering herds.
- [ ] **Dead Letter Queue Routing**: Ensure standard (non-cron) jobs transitioning to the `FAILED` state are handled as a Dead Letter Queue (DLQ).

---

## 🛡️ Milestone 6: REST API Authentication & Cancellation
- [ ] **Job Cancellation Implementation**: Write the controller logic for `cancelJob` inside [job-controller.ts](file:///home/abhijit_1859/Documents/learn-codes/distri/src/api/controllers/job-controller.ts) to transition `PENDING` or `QUEUED` jobs to the `CANCELLED` state.
- [ ] **JWT Auth Middleware**: Secure the endpoints defined in [job-routes.ts](file:///home/abhijit_1859/Documents/learn-codes/distri/src/api/routes/job-routes.ts) using JWT and Role-Based Access Control (RBAC).
