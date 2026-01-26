import { Request, Response } from "express";
import { CalendarConnectionModel } from "../models/CalendarConnection";

function isDebugEnabled() {
  return process.env.ALLOW_DEBUG === "true";
}

/**
 * GET /debug/calendar/:businessId
 * Shows the active calendar connection for that business.
 */
export async function getCalendarConnection(req: Request, res: Response) {
  try {
    if (!isDebugEnabled()) {
      return res.status(403).json({ error: "Debugging not allowed" });
    }

    const raw = req.params.businessId;
    if (typeof raw !== "string") {
      return res.status(400).json({ error: "Invalid businessId param" });
    }

    const businessId = raw.trim();
    if (!businessId) {
      return res.status(400).json({ error: "Missing businessId param" });
    }

    const conn = await CalendarConnectionModel.findOne({
      businessId,
      isActive: true,
    }).lean();

    if (!conn) {
      return res.status(404).json({
        error: "No active calendar connection found",
        businessId,
      });
    }

    return res.json({
      businessId,
      provider: conn.provider,
      calendarId: conn.calendarId ?? "primary",
      timezone: conn.timezone ?? "Asia/Jerusalem",
      isActive: conn.isActive === true,
      hasRefreshToken: Boolean(conn.googleRefreshToken),
      createdAt: conn.createdAt ?? null,
      updatedAt: conn.updatedAt ?? null,
    });
  } catch (err) {
    console.error("[DEBUG_CALENDAR_ERROR]", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}
