import { Router } from "express";
import { jobControllers } from "../controllers/job-controller";
import { authenticateJWT } from "../middlewares/auth-middleware";

const router=Router()


router.post("/jobs", authenticateJWT, jobControllers.enqueue)
router.get("/jobs", authenticateJWT, jobControllers.listJobs)
router.get("/job/:id", authenticateJWT, jobControllers.getJob)
router.post("/jobs/:id/cancel", authenticateJWT, jobControllers.cancelJob)
router.get("/jobs/dlq",authenticateJWT,jobControllers.listDLQJobs)
router.post("/jobs/replay/:id",authenticateJWT,jobControllers.replayJob)
router.delete("/jobs/delete/:id",authenticateJWT,jobControllers.deleteJob)

export default router