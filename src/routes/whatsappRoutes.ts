import { Router } from "express";
import { verifyWebhook, handleWebhook } from "../controller/whatsappController";

const router = Router();

// Meta verification (GET)
router.get("/", verifyWebhook);

// Incoming events (POST)
router.post("/", handleWebhook);

export default router;
