import express from "express";
import { protect } from "../middleware/authMiddleware";
import { getCalendarConnections, getGoogleConnectUrl } from "../controller/calendarController";

const router = express.Router();

router.get("/connections", protect, getCalendarConnections);
router.get("/google/connect-url", protect, getGoogleConnectUrl);

export default router;
