# Agent Context & System Memory

This file serves as a memory buffer and state indicator for the Antigravity agent. It prevents loss of context, maintains architectural consistency across turns, and details the project goals.

---

## 📌 Project Overview
* **Name**: Production-Grade Distributed Job Processing Platform
* **Domain**: Distributed Systems / Backend Engineering Portfolio
* **Core Specialty**: HTTP Jobs (Webhook Delivery & Retrying Engine)
* **Stack**: TypeScript, Node.js, Express.js, PostgreSQL, Prisma, Docker, Jest (Redis and BullMQ to be introduced in Milestone 8)

---

## 🏗️ Architectural Core Decisions
1. **Multi-Role Process Model**: A single codebase containing three entrypoints, deployable as:
   - **API Server**: Receives enqueue requests, lists jobs, auth checks.
   - **Scheduler**: Processes delayed and cron jobs.
   - **Worker**: Polls, locks, executes, and logs jobs.
2. **Database-backed Queue (Phase 1)**:
   - Postgres operates as the message queue.
   - Concurrency resolution achieved via PostgreSQL row-level locks using `SELECT FOR UPDATE SKIP LOCKED` inside explicit transactions.
3. **HTTP Job Focus**:
   - The worker executes HTTP requests (`payload: { url, method, headers, body }`).
   - Must prevent **Server-Side Request Forgery (SSRF)**.
     - *Algorithm*: Parse URL -> DNS lookup host -> Verify IP is NOT in private CIDR spaces (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `127.0.0.0/8`, `169.254.169.254`) -> Make HTTP request direct to target IP to prevent DNS rebinding.
   - Delivers **At-Least-Once Delivery** and injects an idempotency header (`X-Job-Id` or similar) so targets can deduplicate executions.
   - Logs response code (`status_code`) and body (`response_body`) into `JobExecution`.

---

## 📅 Roadmap Milestones
- [x] **Milestone 1**: Environment setup (Docker database, TypeScript compiler configurations, Prisma schema configuration with compound index `(state, runAt, priority Desc)`). Note: Linting, formatting, and tests are deferred for now.
- [x] **Milestone 2**: Database Queue Core & Lock Mechanics (`SELECT FOR UPDATE SKIP LOCKED`).
- [x] **Milestone 3**: Worker Engine & Concurrency Control.
- [ ] **Milestone 4**: Scheduler & Recurring (Cron) Jobs.
- [ ] **Milestone 5**: Error Handling, Retries & DLQ.
- [ ] **Milestone 6**: API Management & Authentication.
- [ ] **Milestone 7**: Observability, Metrics & Audit Logs.
- [ ] **Milestone 8**: Redis & BullMQ Migration.
- [ ] **Milestone 9**: Concurrency Load Testing.

---

## ⚙️ Rules of Engagement
- Act as a **Senior Staff Backend Engineer and Technical Architect**.
- Prioritize **teaching and engineering concepts first** over generating raw code.
- Break every milestone into its 10 essential sections.
- **NEVER** write code implementations for a future milestone until the user explicitly approves and moves into it.
- Maintain documentation integrity and use file links matching the exact absolute paths in the workspace.
