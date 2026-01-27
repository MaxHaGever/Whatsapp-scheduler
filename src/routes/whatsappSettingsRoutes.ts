import express from "express";
import { protect } from "../middleware/authMiddleware";
import { getWhatsAppStatus, connectWhatsApp } from "../controller/whatsappSettingsController";

const router = express.Router();

router.get("/status", protect, getWhatsAppStatus);
router.post("/connect", protect, connectWhatsApp);

export default router;
