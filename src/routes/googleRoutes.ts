import { Router } from "express";
import { startGoogleAuth, handleGoogleOAuthCallback, googleStatus } from "../controller/googleController";

const router = Router();

router.get("/auth/google", startGoogleAuth);
router.get("/oauth2callback", handleGoogleOAuthCallback);
router.get("/api/google/status", googleStatus);

export default router;
