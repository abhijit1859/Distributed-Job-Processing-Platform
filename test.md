# Step-by-Step REST API Implementation Guide (Milestone 6)

Follow these steps to implement the production REST API endpoints to manage, monitor, and cancel jobs.

---

## 🗄️ Step 1: Create the Job Controller

Create the controller to validate request payloads using Zod and perform database queue operations.

* **File**: `src/api/controllers/job-controller.ts`
* **Implementation Code**:
```typescript
import { Request, Response } from 'express';
import { DatabaseQueue } from '../../core/queue/database-queue';
import { prisma } from '../../db/client';
import { z } from 'zod';
import { BackoffType, JobState } from '@prisma/client';

const queue = new DatabaseQueue();

// Validation schema for enqueuing jobs
const enqueueSchema = z.object({
  name: z.string().min(1, 'Job name is required'),
  payload: z.object({
    url: z.string().url('Invalid payload URL'),
    method: z.enum(['GET', 'POST', 'PUT', 'DELETE', 'PATCH']),
    headers: z.record(z.string(), z.string()).optional(),
    body: z.unknown().optional(),
  }),
  priority: z.number().int().min(0).max(30).optional(),
  runAt: z.string().datetime().transform((val) => new Date(val)).optional(),
  maxRetries: z.number().int().min(0).optional(),
  backoffType: z.nativeEnum(BackoffType).optional(),
  backoffDelay: z.number().int().positive().optional(),
  timeout: z.number().int().positive().optional(),
});

export class JobController {
  /**
   * Enqueues a new HTTP job.
   */
  static async enqueue(req: Request, res: Response): Promise<void> {
    try {
      const parsed = enqueueSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ success: false, errors: parsed.error.format() });
        return;
      }

      const { name, payload, ...options } = parsed.data;

      const job = await queue.enqueue(name, payload, options);
      res.status(201).json({ success: true, data: job });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  /**
   * Retrieves specific job metadata and attempt history.
   */
  static async getJob(req: Request, res: Response): Promise<void> {
    try {
      const id = req.params.id as string;
      const job = await prisma.job.findUnique({
        where: { id },
        include: { executions: true },
      });

      if (!job) {
        res.status(404).json({ success: false, error: `Job with ID ${id} not found` });
        return;
      }

      res.status(200).json({ success: true, data: job });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  /**
   * Lists all jobs in the database.
   */
  static async listJobs(req: Request, res: Response): Promise<void> {
    try {
      const jobs = await prisma.job.findMany({
        orderBy: { updatedAt: 'desc' },
      });
      res.status(200).json({ success: true, data: jobs });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  /**
   * Cancels a job if it is still PENDING or QUEUED.
   */
  static async cancelJob(req: Request, res: Response): Promise<void> {
    try {
      const id = req.params.id as string;

      const updated = await prisma.$transaction(async (tx) => {
        const job = await tx.job.findUnique({ where: { id } });
        if (!job) {
          throw new Error('Job not found');
        }

        if (job.state !== JobState.PENDING && job.state !== JobState.QUEUED) {
          throw new Error(`Cannot cancel job in state ${job.state}`);
        }

        return tx.job.update({
          where: { id },
          data: {
            state: JobState.CANCELLED,
            lockedAt: null,
            lockedBy: null,
          },
        });
      });

      res.status(200).json({ success: true, data: updated });
    } catch (err: any) {
      const status = err.message === 'Job not found' ? 404 : 400;
      res.status(status).json({ success: false, error: err.message });
    }
  }
}
```

---

## 📡 Step 2: Create the Job Router

Create the router file to map HTTP endpoints to controller methods.

* **File**: `src/api/routes/job-routes.ts`
* **Implementation Code**:
```typescript
import { Router } from 'express';
import { JobController } from '../controllers/job-controller';

const router = Router();

router.post('/jobs', JobController.enqueue);
router.get('/jobs', JobController.listJobs);
router.get('/jobs/:id', JobController.getJob);
router.post('/jobs/:id/cancel', JobController.cancelJob);

export default router;
```

---

## 🚀 Step 3: Boot the Express Server

Initialize the Express app, enable JSON body parsing, register routers, and configure the listening port.

* **File**: `src/server.ts`
* **Implementation Code**:
```typescript
import express from 'express';
import jobRoutes from './api/routes/job-routes';

const app = express();
app.use(express.json());

// Load Job Routes under /api/v1 prefix
app.use('/api/v1', jobRoutes);

const PORT = process.env.PORT || 3000;

const server = app.listen(PORT, () => {
  console.log(`[API Server] Running on port ${PORT}`);
});

export default server;
```

---

## 🧪 Step 4: Verification & Postman Requests

Once you write the code files above:

1. **Start the API Server**:
   ```bash
   PROCESS_ROLE=api npm run dev
   ```

2. **Send Postman Requests**:

   - **Enqueue Success Job**:
     - **Method**: `POST`
     - **URL**: `http://localhost:3000/api/v1/jobs`
     - **Body (JSON)**:
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
         "timeout": 5000
       }
       ```

   - **List All Jobs**:
     - **Method**: `GET`
     - **URL**: `http://localhost:3000/api/v1/jobs`

   - **Get Specific Job Details**:
     - **Method**: `GET`
     - **URL**: `http://localhost:3000/api/v1/jobs/<JOB_ID>`

   - **Cancel a Job**:
     - **Method**: `POST`
     - **URL**: `http://localhost:3000/api/v1/jobs/<JOB_ID>/cancel`
