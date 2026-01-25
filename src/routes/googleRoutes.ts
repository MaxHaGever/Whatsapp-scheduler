import { Router } from "express";
import {
  startGoogleAuth,
  handleGoogleOAuthCallback,
  googleStatus,
  createTestEvent,
} from "../controller/googleController";

const router = Router();

/**
 * Start OAuth flow (redirect user to Google consent screen)
 * GET /auth/google
 */
router.get("/auth/google", startGoogleAuth);

/**
 * Google redirects back here after consent
 * GET /oauth2callback
 */
router.get("/oauth2callback", handleGoogleOAuthCallback);

/**
 * Debug: shows whether env is configured
 * GET /api/google/status
 */
router.get("/api/google/status", googleStatus);

/**
 * Debug: creates a test event on your calendar (requires refresh token + correct scopes)
 * POST /api/google/test-event
 */
router.post("/api/google/test-event", createTestEvent);

export default router;
