import { Request, Response } from "express";
import { getOAuth2Client, GOOGLE_SCOPES } from "../services/googleAuth";

export function startGoogleAuth(req: Request, res: Response) {
  const oauth2 = getOAuth2Client();
  const url = oauth2.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: GOOGLE_SCOPES,
  });
  return res.redirect(url);
}

export async function handleGoogleOAuthCallback(req: Request, res: Response) {
  const code = String(req.query.code || "");
  if (!code) return res.status(400).send("Missing code");

  const oauth2 = getOAuth2Client();
  const { tokens } = await oauth2.getToken(code);

  const refresh = tokens.refresh_token;
  if (!refresh) {
    return res.status(400).send("No refresh token returned. Try again with prompt=consent.");
  }

  // you currently copy/paste this into DO env
  return res.send(
    `✅ Connected! SAVE THIS REFRESH TOKEN (put it in DO env as GOOGLE_REFRESH_TOKEN): ${refresh}`
  );
}

export function googleStatus(_req: Request, res: Response) {
  const ok = Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_REDIRECT_URI);
  const hasRefresh = Boolean(process.env.GOOGLE_REFRESH_TOKEN);
  return res.json({ ok, hasRefresh });
}
