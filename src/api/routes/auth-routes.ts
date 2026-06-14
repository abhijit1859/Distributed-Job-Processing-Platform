import { Router } from "express";
import { authController } from "../controllers/auth-controller";

const router = Router();

router.post("/auth/register", authController.register);
router.post("/auth/login", authController.login);
router.post("/auth/logout", authController.logout);

export default router;
