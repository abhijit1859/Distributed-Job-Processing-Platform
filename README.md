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

### 3. Run Schema Migrations & Generator
Apply migrations and compile Prisma Client:
```bash
npm run db:migrate
npx prisma generate
```

### 4. Running the Application
Start the unified entrypoint in your desired role:
```bash
# Start as a Worker
PROCESS_ROLE=worker WORKER_CONCURRENCY=5 npm run dev

# Start as an API Server
PROCESS_ROLE=api npm run dev
```

---

## 📡 REST API Specifications

### Current & Proposed Endpoints

#### 1. Enqueue Job
* **Endpoint**: `POST /api/v1/jobs`
* **Request Format**:
```json
{
  "name": "http.request",
  "payload": {
    "url": "https://api.example.com/webhooks",
    "method": "POST",
    "headers": {
      "Content-Type": "application/json"
    },
    "body": { "event": "order.completed", "id": 102 }
  },
  "priority": 20,
  "max_retries": 3,
  "backoff_type": "EXPONENTIAL",
  "backoff_delay": 2000,
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
    "state": "QUEUED",
    "priority": 20,
    "run_at": "2026-06-13T12:00:00.000Z"
  }
}
```

#### 2. Get Job Details & Attempts
* **Endpoint**: `GET /api/v1/jobs/:id`
* **Response (200 OK)**:
```json
{
  "success": true,
  "data": {
    "id": "e81d77a0-0099-4d69-8f85-0c7f3e8f8a84",
    "state": "FAILED",
    "executions": [
      {
        "worker_id": "worker-1",
        "attempt": 1,
        "state": "FAILED",
        "status_code": 504,
        "error": "HTTP Request failed with status code 504"
      }
    ]
  }
}
```

#### 3. Cancel Job (Future)
* **Endpoint**: `POST /api/v1/jobs/:id/cancel`
* **Description**: Transitions a `PENDING` or `QUEUED` job directly to `CANCELLED` state, preventing execution.

---

## 🔮 Future Updates & Roadmap

We are actively developing the platform roadmap to include the following production milestones:

### ⏱️ Scheduler Daemon & Cron Jobs (Milestone 4)
- Run a singleton or lease-locked scheduler process.
- Resolve delayed execution times and parse cron formats to automatically enqueue recurring jobs.

### ⚠️ Dead Letter Queuing & Backoffs (Milestone 5)
- Introduce exponential backoff equations ($delay \times 2^{\text{attempts}}$) to defer retries when target webhooks fail.
- Route permanently failed jobs (exceeding `max_retries`) to a permanent `FAILED` DLQ state.

### 🛡️ REST Auth & RBAC (Milestone 6)
- Secure API endpoints using JWT authentication.
- Limit job enqueues and cancellation methods using Role-Based Access Control (RBAC).

### 📊 Monitoring & Observability (Milestone 7)
- **Prometheus Integration**: Expose a `/metrics` Prometheus-scraping endpoint.
- Export key operational metrics:
  - `jobs_enqueued_total` (counter)
  - `jobs_completed_total` (counter)
  - `jobs_failed_total` (counter)
  - `job_execution_duration_seconds` (histogram of processing latency)
  - `queue_lag_seconds` (time elapsed between `run_at` and actual lock time)
  - `active_worker_threads` (gauge monitoring worker saturation)
- Set up Grafana dashboards to monitor throughput, error rates, and retry counts.

### 🏎️ Redis & BullMQ Migration (Milestone 8)
- Abstract the database queue layer.
- Build a high-performance alternate queue driver utilizing Redis Streams and BullMQ.
