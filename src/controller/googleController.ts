import type { Request, Response } from "express";
import { google } from "googleapis";
import { DateTime } from "luxon";
import { getOAuth2Client, GOOGLE_SCOPES } from "../services/googleAuth";

const TZ = "Asia/Jerusalem";

/**
 * GET /auth/google
 * Redirect user to Google consent screen.
 */
export function startGoogleAuth(_req: Request, res: Response) {
  const oauth2 = getOAuth2Client();

  // force prompt consent so you can reliably get a refresh_token in testing
  // (Google may not return refresh_token on repeat auth unless prompt=consent)
  const url = oauth2.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: GOOGLE_SCOPES,
  });

  return res.redirect(url);
}

/**
 * GET /oauth2callback
 * Google sends us back ?code=...
 * Exchange code for tokens. If we get a refresh_token, show it so you can save to env.
 */
export async function handleGoogleOAuthCallback(req: Request, res: Response) {
  try {
    const code = String(req.query.code || "");
    if (!code) return res.status(400).send("Missing ?code");

    const oauth2 = getOAuth2Client();
    const { tokens } = await oauth2.getToken(code);

    // IMPORTANT:
    // refresh_token usually arrives only the first time per user+client unless prompt=consent
    const refreshToken = tokens.refresh_token;

    // You can set it in runtime (useful for immediate testing),
    // but for production you should store it (env/DB).
    if (refreshToken) {
      process.env.GOOGLE_REFRESH_TOKEN = refreshToken;
    }

    // Set creds so we can immediately call APIs on this request (optional).
    oauth2.setCredentials({
      refresh_token: refreshToken || process.env.GOOGLE_REFRESH_TOKEN,
      access_token: tokens.access_token,
    });

    // Show the refresh token in the response so you can paste into DO env vars
    if (refreshToken) {
      return res
        .status(200)
        .send(
          `✅ Connected!\n\nSAVE THIS REFRESH TOKEN and put it in DigitalOcean env as GOOGLE_REFRESH_TOKEN:\n\n${refreshToken}\n`
        );
    }

    // If no refresh token came back, you likely authorized before.
    // Fix: revoke access and re-auth, or keep prompt=consent (already set).
    return res.status(200).send(
      `✅ Connected (no new refresh token returned).\n\n` +
        `If you already saved GOOGLE_REFRESH_TOKEN before, you're fine.\n` +
        `If not, revoke access for this app in your Google Account and run /auth/google again.\n`
    );
  } catch (err) {
    console.error("[GOOGLE_OAUTH_CALLBACK_ERROR]", err);
    return res.status(500).send("OAuth callback failed. Check server logs.");
  }
}

/**
 * GET /api/google/status
 * Quick debug endpoint.
 */
export function googleStatus(_req: Request, res: Response) {
  const hasClientId = Boolean(process.env.GOOGLE_CLIENT_ID);
  const hasClientSecret = Boolean(process.env.GOOGLE_CLIENT_SECRET);
  const hasRedirect = Boolean(process.env.GOOGLE_REDIRECT_URI);
  const hasRefresh = Boolean(process.env.GOOGLE_REFRESH_TOKEN);

  return res.json({
    google: {
      hasClientId,
      hasClientSecret,
      hasRedirectUri: hasRedirect,
      hasRefreshToken: hasRefresh,
      scopes: GOOGLE_SCOPES,
    },
  });
}

/**
 * POST /api/google/test-event
 * Creates a test event ~10 minutes from now.
 * Requires GOOGLE_REFRESH_TOKEN and calendar scopes.
 */
export async function createTestEvent(_req: Request, res: Response) {
  try {
    const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;
    if (!refreshToken) {
      return res.status(400).json({
        ok: false,
        error: "Missing GOOGLE_REFRESH_TOKEN in env",
      });
    }

    const oauth2 = getOAuth2Client();
    oauth2.setCredentials({ refresh_token: refreshToken });

    const calendar = google.calendar({ version: "v3", auth: oauth2 });

    const start = DateTime.now().setZone(TZ).plus({ minutes: 10 }).startOf("minute");
    const end = start.plus({ minutes: 30 });

    const resp = await calendar.events.insert({
      calendarId: "primary",
      requestBody: {
        summary: "WhatsApp Bot Test Event",
        description: "Created by WhatsApp scheduling bot",
        start: { dateTime: start.toISO(), timeZone: TZ },
        end: { dateTime: end.toISO(), timeZone: TZ },
      },
    });

    return res.json({
      ok: true,
      eventId: resp.data.id,
      htmlLink: resp.data.htmlLink,
      start: start.toISO(),
      end: end.toISO(),
    });
  } catch (err) {
    console.error("[GOOGLE_TEST_EVENT_ERROR]", err);
    return res.status(500).json({
      ok: false,
      error: "Failed to create test event. Check logs (scopes/refresh token).",
    });
  }
}
