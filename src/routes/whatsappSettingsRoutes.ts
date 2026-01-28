import { Router } from "express";
import { requireAuth } from "../middleware/authMiddleware";
import {
  getWhatsAppStatus,
  connectWhatsApp,
  sendWhatsAppTestMessage,
} from "../controller/whatsappSettingsController";

const router = Router();

/**
 * All routes are business-scoped via JWT (req.user.businessId)
 */
router.get("/status", requireAuth, getWhatsAppStatus);

/**
 * Client provides WhatsApp Cloud API credentials for their business:
 * - wabaId
 * - phoneNumberId
 * - accessToken (permanent recommended)
 */
router.post("/connect", requireAuth, connectWhatsApp);

/**
 * Optional: send a test message to confirm credentials work
 */
router.post("/test-message", requireAuth, sendWhatsAppTestMessage);

export default router;
