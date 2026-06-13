# System Architecture & Documentation

This document describes the high-level design, component boundaries, repository structure, and data flows of the **Production-Grade Distributed Job Processing Platform**.

---

## 1. System Overview

The platform is designed to decouple job generation from job execution. This enables horizontal scaling of the backend, isolating resource-intensive jobs from public-facing REST APIs.

### Key Components

1. **API Server (Express.js)**:
   - Receives HTTP requests from external clients or internal microservices.
   - Responsible for authenticating requests, validating job payloads, enqueuing jobs into the database, and returning job status.
   - *Scale Strategy*: Stateless, can be scaled horizontally behind a Load Balancer (round-robin or least-connections).

2. **Scheduler Daemon (TypeScript Loop)**:
   - Responsible for time-based operations: checking for delayed jobs that are ready to run, and resolving recurring cron-based jobs.
   - It updates the state of eligible jobs from `PENDING` to `QUEUED` so that workers can pick them up.
   - *Scale Strategy*: Active-Passive (singleton) to avoid duplicate cron executions, or designed with lease-locking so only one scheduler acts as leader.

3. **Worker Pool (TypeScript / Node.js Worker Threads or Processes)**:
   - Pulls `QUEUED` jobs from the database, resolves the target IP to prevent SSRF, executes the HTTP request, and updates state (`COMPLETED` or `FAILED`).
   - Supports request execution timeouts, custom headers, status-code-based failures, retry mechanisms, and concurrency limits.
   - *Scale Strategy*: Highly horizontal. Multiple worker instances can run on different servers/containers, pulling from the same central database.

4. **Shared Database (PostgreSQL)**:
   - The central source of truth. Stores job configuration, scheduling state, and execution history.
   - Acts as the message broker in early stages by utilizing locking mechanisms.

---

## 2. Directory Structure

To keep the codebase clean, modular, and maintainable, we use the following directory structure:

```
distri/
├── .gemini/                  # IDE specific config
├── docker-compose.yml         # Dev environment services (PostgreSQL, PgAdmin)
├── package.json               # Dependencies and scripts
├── tsconfig.json              # TypeScript compilation rules
├── prisma/                    # Prisma DB Schema and Migrations
│   ├── schema.prisma          # Database schema definition
│   └── migrations/            # Auto-generated SQL migrations
├── src/
│   ├── index.ts               # Core app bootstrapper (selects process role)
│   ├── api/                   # API Server process
│   │   ├── controllers/       # Route handlers (auth, jobs)
│   │   ├── middlewares/       # JWT auth, RBAC, input validation, errors
│   │   └── routes/            # Route definitions mapped to controllers
│   ├── core/                  # Shared Business Logic & Engines
│   │   ├── queue/             # DB Queue client (Enqueue, Lock, Complete, Fail)
│   │   ├── scheduler/         # Scheduler loop (delayed and cron jobs)
│   │   └── worker/            # Worker worker-loop & job executor
│   ├── db/                    # Database client initialization
│   │   └── client.ts          # Single Prisma client instance
│   ├── shared/                # Code shared across all components
│   │   ├── errors/            # Custom application errors
│   │   ├── types/             # TypeScript Interfaces and Enums
│   │   ├── utils/             # Helper functions (cron parser, backoff calc)
│   │   └── logger.ts          # Structured logger (Winston/Pino)
│   └── tests/                 # Test Suites
│       ├── unit/              # Isolated function testing
│       ├── integration/       # Database & API integration tests
│       └── concurrency/       # Lock contention and race condition tests
```

---

## 3. Detailed Data Lifecycle Flow

A job transitions through a series of states. Below is the state machine representation.

```
       [ Client Request ]
               |
               v
          +---------+          run_at > NOW
          | PENDING | ----------------------------+
          +---------+                             |
               |                                  |
               | run_at <= NOW                    |
               v                                  |
          +---------+                             |
          | QUEUED  | <---------------------------+ (Scheduler moves it here)
          +---------+
               |
               | Worker locks job (SELECT FOR UPDATE SKIP LOCKED)
               v
          +---------+
          | RUNNING |
          +---------+
         /           \
        /             \  Job succeeds
       /               \---------------------------> +-----------+
      /                                              | COMPLETED |
     / Job fails                                     +-----------+
    v
+--------+           retries_count < max_retries
| FAILED | ----------------------------------------> (Recalculate run_at and
+--------+                                            move back to QUEUED/PENDING)
    |
    | retries_count >= max_retries (DLQ)
    v
+--------------+
| DEAD_LETTER  |
+--------------+
```

### 1. Creation (Enqueue)
- Client sends a request to the API server to trigger a job.
- The API server validates request structure and payload size.
- A new `Job` record is created in the database.
  - If `run_at` is in the future, the job starts as `PENDING`.
  - If `run_at` is immediate, the job starts as `QUEUED`.

### 2. Retrieval & Locking (Worker Execution)
- Workers run an infinite loop polling the database.
- A worker requests the next eligible job (`state = 'QUEUED' AND run_at <= NOW()`) ordered by `priority DESC, run_at ASC`.
- To avoid multiple workers grabbing the same job, the worker executes a transaction with row-level locking:
  ```sql
  SELECT * FROM "Job"
  WHERE "state" = 'QUEUED' AND "run_at" <= NOW()
  ORDER BY "priority" DESC, "run_at" ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;
  ```
- The winning worker immediately updates the state to `RUNNING`, sets `locked_at` to the current time, sets `locked_by` to its worker ID, and commits the transaction.
- The lock is released at the DB level, but the job state in the database remains `RUNNING` representing application-level lease locking.

### 3. Execution & Completion
- **Security Check (SSRF Protection)**: The worker parses the target URL, resolves the host domain to an IP address via DNS, and validates the IP against a blacklist of private/internal CIDR blocks (e.g. local loopbacks, local networks, metadata endpoints). If it is blacklisted, the job is failed immediately without triggering the HTTP call.
- **HTTP Request Trigger**: The worker initializes an HTTP client (e.g., using `axios` or native `fetch` with a custom agent to enforce timeouts) and makes the request with the payload's `method`, `headers`, and `body`.
- **Status Code Evaluation**:
  - **Success Path**: If the HTTP response status code is a successful code (2xx), the worker marks the job state as `COMPLETED` and creates a `JobExecution` log containing the status code and a truncated response body.
  - **Failure Path**: If the request fails (network error, timeout, DNS resolution failure) or returns a non-2xx status code (e.g. 4xx, 5xx):
    - The worker increments `retries_count` and records a `FAILED` execution log with the status code, response body, and error details.
    - If `retries_count < max_retries`: The worker calculates the next retry timestamp based on the backoff strategy, sets the job state back to `PENDING` or `QUEUED`, and updates `run_at`.
    - If `retries_count >= max_retries`: The job is marked as `FAILED` permanently and moved to the Dead Letter Queue (DLQ) state.

---

## 4. Key Architectural Trade-offs

### PostgreSQL as a Queue (Phase 1)
* **Pros**:
  - Simple operational footprint: No extra infrastructure (Redis, RabbitMQ) to configure, back up, or maintain.
  - Transactional safety: Enqueuing a job can be part of the same transaction that updates business data. If the database update fails, the job isn't sent (and vice versa).
  - Power of SQL: Easy to write queries to inspect queues, filter jobs, calculate metrics, and update bulk rows.
* **Cons**:
  - Higher disk I/O: Databases are optimized for long-term storage, not ephemeral queues where records are constantly inserted and deleted.
  - Scale limit: Locking tables can create bottlenecks at extremely high throughput (e.g., > 5000 jobs/sec).

### Redis + BullMQ (Phase 2)
* **Pros**:
  - High performance: In-memory data store can handle tens of thousands of operations per second with sub-millisecond latency.
  - Out-of-the-box features: BullMQ provides built-in rate-limiting, parent-child job dependencies, and automatic backoff/retries.
* **Cons**:
  - Operational overhead: Requires running and securing a Redis cluster.
  - Two-Phase Commits / Outbox Pattern: If you write to PostgreSQL and then enqueue to Redis, one can fail while the other succeeds. This requires complex transactional outbox patterns to achieve reliability.
