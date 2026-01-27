import { Request, Response, NextFunction } from "express";
import crypto from "crypto";
import { AuthenticateRequest } from "../middleware/authMiddleware";
import { CalendarConnectionModel } from "../models/CalendarConnection";
import { getOAuth2Client, GOOGLE_SCOPES } from "../services/googleAuth";

// We’ll sign state so callback can trust it (simple HMAC)
function signState(businessId: string) {
  const secret = process.env.JWT_SECRET || "dev";
  const nonce = crypto.randomBytes(12).toString("hex");
  const payload = `${businessId}.${nonce}`;
  const sig = crypto.createHmac("sha256", secret).update(payload).digest("hex");
  return `${payload}.${sig}`;
}

function verifyState(state: string) {
  const secret = process.env.JWT_SECRET || "dev";
  const parts = state.split(".");
  if (parts.length !== 3) return null;
  const [businessId, nonce, sig] = parts;
  const payload = `${businessId}.${nonce}`;
  const expected = crypto.createHmac("sha256", secret).update(payload).digest("hex");
  if (expected !== sig) return null;
  return { businessId };
}

// 1) Status endpoint
export const getCalendarConnections = async (
  req: AuthenticateRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.businessId) return res.status(401).json({ message: "Missing businessId in token" });

    const conn = await CalendarConnectionModel.findOne({ businessId: req.businessId });

    res.json({
      provider: "google",
      connected: !!(conn?.googleRefreshToken),
      connectedEmail: conn?.connectedEmail ?? null,
      calendarId: conn?.googleCalendarId ?? "primary",
      updatedAt: conn?.updatedAt ?? null,
    });
  } catch (err) {
    next(err);
  }
};

// 2) Generate connect URL for frontend
export const getGoogleConnectUrl = async (
  req: AuthenticateRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.businessId) return res.status(401).json({ message: "Missing businessId in token" });

    const oauth2Client = getOAuth2Client();

    const state = signState(req.businessId);

    const url = oauth2Client.generateAuthUrl({
      access_type: "offline",
      prompt: "consent", // ensures refresh token on first connect
      scope: GOOGLE_SCOPES,
      state,
    });

    res.json({ url });
  } catch (err) {
    next(err);
  }
};

// 3) Callback handler: store refresh token for business from state
export const handleGoogleOAuthCallbackMultiTenant = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const code = String(req.query.code || "");
    const state = String(req.query.state || "");

    const verified = verifyState(state);
    if (!verified) return res.status(400).send("Invalid state");

    const oauth2Client = getOAuth2Client();
    const { tokens } = await oauth2Client.getToken(code);

    const refreshToken = tokens.refresh_token;
    if (!refreshToken) {
      return res
        .status(400)
        .send("No refresh_token returned. Try reconnecting with prompt=consent.");
    }

    await CalendarConnectionModel.findOneAndUpdate(
      { businessId: verified.businessId },
      {
        businessId: verified.businessId,
        googleRefreshToken: refreshToken,
        googleCalendarId: process.env.GOOGLE_CALENDAR_ID || "primary",
        connectedEmail: null, // optional: you can fetch from Google later
      },
      { upsert: true, new: true }
    );

    // redirect to your dashboard frontend route later (for now: simple message)
    res.send("Google Calendar connected. You can close this tab and return to the dashboard.");
  } catch (err) {
    next(err);
  }
};
