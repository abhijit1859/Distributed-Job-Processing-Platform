# Concepts to Learn & Core Engineering Principles

This document explains the core engineering principles for **Milestone 1** from first principles, discussing alternatives, trade-offs, and practical industry applications.

---

## 1. Monolith vs. Distributed Multi-Role Process Architecture

### First Principles
A program is a set of instructions executed by a computer. In web development, a codebase is often run as a single process (the web server). However, a production application has different runtime characteristics:
* **HTTP API Server**: Needs to be highly responsive, lightweight, and handle high numbers of concurrent, short-lived network connections.
* **Worker Process**: Executes computational, heavy, or long-running tasks. It may block the thread or consume high CPU/Memory.
* **Scheduler Process**: Wakes up occasionally to check schedules. Needs to run exactly once (or be heavily coordinated) to avoid double execution.

Running all three in a single process means a single heavy job can block the event loop or exhaust memory, crashing the API server and taking down the user interface.

### The Multi-Role Codebase (The "12-Factor App" Process Model)
Instead of splitting the code into three different git repositories (which increases operational maintenance), we write a single codebase but configure it to run in **different roles** based on configuration (e.g. environment variables or command-line flags).

#### How It Works
* Deploy container image with `process.role=api` -> Starts only `src/api/server.ts`
* Deploy container image with `process.role=worker` -> Starts only `src/core/worker/index.ts`
* Deploy container image with `process.role=scheduler` -> Starts only `src/core/scheduler/index.ts`

#### Trade-offs
* **Pros**: Single repository to test, build, and deploy. Shared database schemas (via Prisma), shared utility functions, and type safety across boundaries.
* **Cons**: Larger image size, but typically negligible for Node.js. Developers must be careful not to introduce tight runtime coupling.

---

## 2. Database Schema Modeling for Distributed Queues

### First Principles
A queue is a First-In-First-Out (FIFO) data structure. In a distributed job processor, the queue must survive server restarts, support priority levels, handle delayed executions, log execution attempts, and allow multiple instances to pull work concurrently.

To achieve this in a Relational Database, we represent the queue as a table of rows. Each row represents a "message" (or Job).

### The Key Fields Explained

1. **State Machine (`state`)**:
   We model the lifecycle of a job using states: `PENDING`, `QUEUED`, `RUNNING`, `COMPLETED`, `FAILED`, and `CANCELLED`.
   * **Why**: It prevents workers from picking up jobs that are already in progress or completed, and provides queryable filters.

2. **Priority (`priority`)**:
   An integer (e.g., 0-30).
   * **Why**: In real systems, a password-reset email must execute before a weekly statistics calculation. We sort our pickup query by `priority DESC` to process critical items first.

3. **Scheduled Run Time (`run_at`)**:
   A timestamp with timezone.
   * **Why**: To support delayed execution (e.g., "send an email in 2 hours"). The database engine ignores jobs where `run_at > NOW()`.

4. **Lease Locks (`locked_at`, `locked_by`, `timeout`)**:
   * **Why**: Workers are distributed across networks. If a worker dies mid-execution, we need to know that the job is stalled. If `state = 'RUNNING'` and `locked_at + timeout < NOW()`, the job is considered timed out and can be reclaimed by another worker.

---

## 3. Relational Indexing for Queues

### First Principles
In database engines, an index is a data structure (usually a B-Tree) that allows the engine to locate rows without checking every single row in the table (a full table scan).
* A **B-Tree Index** keeps data sorted by index keys, allowing $O(\log n)$ search times.

### Compound Indexes vs. Single Indexes
A worker polls the queue using a specific query:
```sql
SELECT * FROM "Job" 
WHERE "state" = 'QUEUED' 
  AND "run_at" <= NOW() 
ORDER BY "priority" DESC, "run_at" ASC 
LIMIT 1;
```

If we only index `state`, PostgreSQL has to find all rows where `state = 'QUEUED'`, sort them in memory by priority, and then check which ones have `run_at <= NOW()`. This becomes extremely slow when the table grows to millions of rows.

A **Compound (Composite) Index** combines multiple columns into a single index structure. 
Our index is defined on: `(state, run_at, priority DESC)`.

#### How PostgreSQL Walks the Compound Index
1. **Filter by State**: The index first groups entries by `state`. It jumps straight to the `QUEUED` block.
2. **Filter by Run Time**: Within the `QUEUED` block, it filters out entries where `run_at > NOW()`.
3. **Sort by Priority**: Within the filtered set, it looks up the highest `priority` values since they are already pre-sorted in descending order.
4. **Fetch**: It returns the matching records in constant time, avoiding any in-memory sorting.

---

## 4. Introduction to Concurrency and Row-Level Locks

### The Double-Execution Problem (Race Conditions)
Imagine two workers, Worker A and Worker B, running concurrently. They both execute the poll query at the exact same millisecond:
1. Worker A queries: "Give me the next job." DB returns Job ID `101`.
2. Worker B queries: "Give me the next job." DB returns Job ID `101` (since Worker A hasn't updated the state to `RUNNING` yet).
3. Worker A updates Job `101` to `RUNNING` and executes it.
4. Worker B updates Job `101` to `RUNNING` and executes it.
* **Result**: Job `101` is processed twice (e.g., a customer is charged twice).

### The Solution: `FOR UPDATE SKIP LOCKED`
To solve this, relational databases support row-level locking. We append `FOR UPDATE SKIP LOCKED` to our query.

* **`FOR UPDATE`**: Instructs the database to place an exclusive write lock on the selected row(s). Any other transaction trying to select or write to these rows will block (wait) until the locking transaction finishes (commits or rolls back).
* **`SKIP LOCKED`**: Instead of making other transactions block/wait, `SKIP LOCKED` instructs them to ignore any rows that are currently locked by other transactions and move on to the next available row.

This allows Worker A and Worker B to query the database simultaneously:
* Worker A locks Job `101`.
* Worker B executes the same query, sees Job `101` is locked, skips it, and grabs Job `102` instead.
* This unlocks true, conflict-free parallel processing.
* **Trade-off**: Requires running the select and update statements within an explicit database transaction (`BEGIN ... COMMIT`).
* We will implement and test this mechanism in Milestone 2.

---

## 5. Webhook & HTTP Job Challenges: SSRF and Idempotency

### Server-Side Request Forgery (SSRF) in Job Processing
#### First Principles
When a server takes a URL from a client and fetches it, the server operates under its own network security credentials. In a cloud environment, this means the server can make HTTP requests to databases, cache systems, cloud instance metadata services, or other internal microservices that are protected from the public internet.
An attacker submitting an HTTP job could supply `http://localhost:5432` to scan database ports, or `http://169.254.169.254/latest/meta-data/` to steal AWS IAM credentials.

#### Prevention via DNS Resolution Pre-flight
Simply string-matching for `localhost` or `127.0.0.1` is insufficient (attackers can use DNS records like `spoof.myip.com` pointing to `127.0.0.1` or decimal IPs like `2130706433`).
1. **Resolve Host**: Resolve the domain to its underlying IP address using DNS resolution before making the request.
2. **Verify CIDR**: Check the resolved IP address against RFC 1918 (private IP spaces: `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`), loopback (`127.0.0.0/8`), and link-local (`169.254.169.254`).
3. **Block/Allow**: If the IP falls into a private/local CIDR block, abort the job immediately and log a security failure. Otherwise, execute the HTTP request using the *resolved IP address* directly (to prevent DNS pinning/rebinding attacks between validation and request execution).

### At-Least-Once Delivery & Idempotency
#### First Principles
In distributed networks, connections can drop at any point:
1. **Case A**: Worker fails to send the request (request never reached target).
2. **Case B**: Request reaches target, target processes it, but target crashes before returning a response.
3. **Case C**: Request reaches target, target processes it, returns `200 OK`, but the connection drops before the worker receives it.

If the worker retries the job (Case B & C), the target will receive the request *again*. 
Because of Case C, distributed HTTP delivery systems can never guarantee *exactly-once* delivery. They target **At-Least-Once Delivery**.

#### Designing for Idempotency
To prevent double-processing on the receiver's end, the receiver must implement **Idempotency** (processing a request once, and returning the same result for duplicate subsequent requests).
* **The Solution**: The worker will inject the job's unique `id` into the HTTP headers (e.g. `Idempotency-Key` or `X-Job-Id`).
* The receiving server checks if it has processed that `X-Job-Id` before. If yes, it skips execution and returns the cached response.

