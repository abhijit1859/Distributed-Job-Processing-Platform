import { Router } from "express";
import { jobControllers } from "../controllers/job-controller";

const router=Router()


router.post("/jobs",jobControllers.enqueue)
router.get("/jobs",jobControllers.listJobs)
router.get("/job/:id",jobControllers.getJob)
router.post("/jobs/:id/cancel",jobControllers.cancelJob)

export default router