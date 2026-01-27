import { Router } from "express";
import { googleStatus } from "../controller/googleController";

const router = Router();

router.get("/api/google/status", googleStatus);

export default router;
