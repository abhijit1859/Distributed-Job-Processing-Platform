# Production-Grade Distributed Job Processing Platform

A high-performance, resilient, distributed HTTP job processing and webhook delivery engine built in TypeScript and Node.js. 

---

## 🏗️ System Architecture

This platform uses a **Multi-Role Process Model** (following 12-factor application design principles). The same codebase can be built, packaged, and deployed as different server roles depending on container orchestration settings:

- **API Server**: Handles client interactions, JWT authentication, and pushes new jobs into the database.
- **Scheduler Daemon**: Periodically checks for delayed jobs and evaluates cron expressions to queue recurring jobs.
- **Worker Pool**: Polls the database for queued jobs, locks them atomically, prevents SSRF attacks, executes HTTP payloads, and records attempt logs.

```
                  +-----------------------+
                  |      Client / UI      |
                  +-----------------------+
                              │
                     REST API │ HTTP
                              ▼
                  +-----------------------+
                  |       API Server      |  (Runs Express API)
                  +-----------------------+
                              │
                    Prisma    │ Read/Write
                              ▼
                  +-----------------------+
                  |  PostgreSQL Database  |  (Single source of truth)
                  +-----------------------+
                     ▲                 ▲
         Prisma Read │                 │ Prisma Read/Write/Lock
               Write │                 │
   +----------------─+----+       +----+------------------+
   |       Scheduler      |       |      Worker Pool       |  (Runs Worker code)
   |                      |       |                        |
   | - Parses Cron        |       | - Polls database       |  (Runs N threads/tasks)
   | - Polls scheduled    |       | - Locks & Runs jobs    |
   |   jobs to queue them |       | - Updates job state    |
   +----------------------+       +------------------------+
```

---

## 🛠️ Technology Stack & Core Mechanisms

- **Runtime & Language**: Node.js, TypeScript.
- **Database Layer**: PostgreSQL, Prisma.
- **Queue Mechanics**: Relational Database Queue utilizing row-level pessimistic locking (`SELECT FOR UPDATE SKIP LOCKED` inside raw SQL updates) to prevent double-execution across concurrent workers.
- **Security Engine**: Custom SSRF and DNS Rebinding protection (resolving host DNS to target IP, filtering out private subnets like `127.0.0.0/8`, `10.0.0.0/8`, etc., and reconstructing requests with the raw IP + custom `Host` headers).

---

## 🚀 Getting Started

### 1. Environment Configuration
Create a `.env` file in the root directory:
```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/distri?schema=public"
ALLOW_PRIVATE_IPS=true
PROCESS_ROLE=worker
```

### 2. Run Database Instance
Spin up PostgreSQL via Docker Compose:
```bash
docker-compose up -d
```

### 3. Run Schema Migrations & Generate Client
Apply migrations and compile Prisma Client:
```bash
npm run db:migrate
npx prisma generate
```

### 4. Running the Application
Start the entrypoint process in your desired role (uses `ts-node-dev` in development):
```bash
# Start as a Worker (processes jobs from the queue)
PROCESS_ROLE=worker WORKER_CONCURRENCY=5 npm run dev

# Start as an API Server (exposes REST endpoints)
PROCESS_ROLE=api npm run dev
```

### 5. Running Verification Scripts
We have interactive scripts to verify parts of the queue and worker subsystems:
```bash
# Verify row-level locking & concurrency (with mock workers)
npx ts-node src/scratch/test-queue.ts

# Verify HTTP requests, fail/retry states, SSRF protection & timeout logic
npx ts-node src/scratch/test-worker.ts
```

---

## 📡 REST API Specifications

The Express API server runs on port `3000` by default.

### Endpoints

#### 1. Enqueue a Job
* **Endpoint**: `POST /jobs`
* **Headers**: `Content-Type: application/json`
* **Request Format**:
```json
{
  "name": "http.request",
  "payload": {
    "url": "https://httpbin.org/post",
    "method": "POST",
    "headers": {
      "Content-Type": "application/json"
    },
    "body": { "event": "order.completed", "id": 102 }
  },
  "priority": 20,
  "maxRetries": 3,
  "backoffType": "EXPONENTIAL",
  "timeout": 10000
}
```
* **Response (201 Created)**:
```json
{
  "success": true,
  "data": {
    "id": "e81d77a0-0099-4d69-8f85-0c7f3e8f8a84",
    "name": "http.request",
    "payload": {
      "url": "https://httpbin.org/post",
      "method": "POST",
      "headers": {
        "Content-Type": "application/json"
      },
      "body": { "event": "order.completed", "id": 102 }
    },
    "state": "QUEUED",
    "priority": 20,
    "runAt": "2026-06-14T12:00:00.000Z",
    "maxRetries": 3,
    "retriesCount": 0,
    "backoffType": "EXPONENTIAL",
    "backoffDelay": 1000,
    "cronExpression": null,
    "lockedAt": null,
    "lockedBy": null,
    "timeout": 10000,
    "updatedAt": "2026-06-14T12:00:00.000Z"
  }
}
```

#### 2. List All Jobs
* **Endpoint**: `GET /jobs`
* **Response (200 OK)**:
```json
{
  "JOBS": [
    {
      "id": "e81d77a0-0099-4d69-8f85-0c7f3e8f8a84",
      "name": "http.request",
      "state": "COMPLETED",
      "priority": 20,
      ...
    }
  ]
}
```

#### 3. Get Job Details
* **Endpoint**: `GET /job/:id`
* **Response (200 OK)**:
```json
{
  "job": {
    "id": "e81d77a0-0099-4d69-8f85-0c7f3e8f8a84",
    "name": "http.request",
    "state": "QUEUED",
    "priority": 20,
    ...
  }
}
```

#### 4. Cancel Job
* **Endpoint**: `POST /jobs/:id/cancel`
* **Description**: Transitions a `PENDING` or `QUEUED` job directly to the `CANCELLED` state, preventing execution.

---

## 🔮 Roadmap & Implementation Status

We are actively developing the platform across various milestones:

### ✅ Project Setup & DB Schema (Milestone 1)
- [x] Configure TypeScript project and Docker setup for PostgreSQL.
- [x] Initialize Prisma with relational `Job` and `JobExecution` models.
- [x] Create database indexing optimizations for state-based job fetching.

### ✅ Database Queue Core & Lock Mechanics (Milestone 2)
- [x] Implement row-level pessimistic locking (`SELECT FOR UPDATE SKIP LOCKED`) inside raw SQL queries to ensure atomic job fetching.
- [x] Build transactional helper functions to complete or fail jobs.
- [x] Support exponential and fixed backoffs.

### ✅ Worker Engine & Concurrency Control (Milestone 3)
- [x] Build multi-threaded/concurrent Worker polling loop.
- [x] Integrate custom SSRF and DNS Rebinding protection.
- [x] Define unified project entrypoint selecting process roles.

### ⏳ Scheduler & Recurring Jobs (Milestone 4 - In Progress)
- [x] Parse standard cron formats (`cron-parser`) to calculate next runtimes.
- [x] Build a scheduler loop to automatically promote ready delayed jobs.
- [ ] Complete full scheduler process roles integration in entrypoint.

### ⏳ Error Handling & DLQ (Milestone 5 - In Progress)
- [x] Dead Letter Queue Routing (standard non-cron jobs transition permanently to FAILED state upon exhausting max retries).
- [ ] Exponential Backoff Jitter (introduce random variance to avoid thundering herds).

### ⏱️ REST API Server (Milestone 6 - In Progress)
- [x] Implement Express server with routing structure.
- [x] Implement Zod payload validation for enqueue parameters.
- [ ] Add JWT authentication & Role-Based Access Control (RBAC).

### 📊 Monitoring & Observability (Milestone 7 - Future)
- [ ] Prometheus metrics exposing endpoint (`/metrics`).
- [ ] Grafana dashboard integration.

### 🏎️ Redis & BullMQ Migration (Milestone 8 - Future)
- [ ] Queue abstraction interface.
- [ ] Alternate queue driver implementation utilizing Redis and BullMQ.
