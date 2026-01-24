import { Router } from "express";
import { getOAuth2Client, GOOGLE_SCOPES } from "../services/googleAuth";
import { createTestEvent } from "../services/googleCalendar";

const router = Router();

/**
 * Step 1: Send user to Google consent screen
 */
router.get("/auth/google", (req, res) => {
  const oauth2 = getOAuth2Client();

  const url = oauth2.generateAuthUrl({
    access_type: "offline",     // REQUIRED to get refresh token
    prompt: "consent",          // ensures refresh token on first connect
    scope: GOOGLE_SCOPES
  });

  res.redirect(url);
});

/**
 * Step 2: Google redirects here with ?code=
 * We exchange code for tokens and show the refresh token
 */
router.get("/oauth2callback", async (req, res) => {
  try {
    const code = typeof req.query.code === "string" ? req.query.code : null;
    if (!code) return res.status(400).send("Missing code");

    const oauth2 = getOAuth2Client();
    const { tokens } = await oauth2.getToken(code);

    // IMPORTANT: save tokens.refresh_token somewhere secure
    // For your 1-client setup, we’ll copy it once and store in DO env var.
    if (!tokens.refresh_token) {
      return res
        .status(200)
        .send(
          "No refresh_token returned. Try again with a different Google account, or remove app access and retry."
        );
    }

    res
      .status(200)
      .send(
        `✅ Connected!\n\nSAVE THIS REFRESH TOKEN (put it in DO env as GOOGLE_REFRESH_TOKEN):\n\n${tokens.refresh_token}`
      );
  } catch (e: any) {
    console.error(e);
    res.status(500).send("OAuth failed");
  }
});

/**
 * Step 3: Create a test event (uses stored refresh token)
 */
router.post("/calendar/test-event", async (req, res) => {
  try {
    const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;
    if (!refreshToken) return res.status(400).json({ error: "Missing GOOGLE_REFRESH_TOKEN" });

    const event = await createTestEvent(refreshToken);
    res.json({ ok: true, event });
  } catch (e: any) {
    console.error(e);
    res.status(500).json({ ok: false, error: e?.message || "Failed" });
  }
});

export default router;
