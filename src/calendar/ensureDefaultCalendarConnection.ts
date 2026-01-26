import { CalendarConnectionModel } from "../models/CalendarConnection";

/**
 * Temporary helper:
 * Ensure the default business has an active calendar connection in Mongo.
 * For now it seeds using env vars until we build the OAuth UI.
 */
export async function ensureDefaultCalendarConnection(businessId: string) {
  const existing = await CalendarConnectionModel.findOne({
    businessId,
    isActive: true,
  });

  if (existing) return existing;

  // Temporary env-based seed
  const calendarId = process.env.GOOGLE_CALENDAR_ID || "primary";
  const timezone = process.env.DEFAULT_TZ || process.env.TZ || "Asia/Jerusalem";

  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN || null;

  const created = await CalendarConnectionModel.create({
    businessId,
    provider: "google",
    googleRefreshToken: refreshToken,
    calendarId,
    timezone,
    isActive: true,
  });

  console.log(
    `[CALENDAR] Created default calendar connection for businessId=${businessId} provider=google`
  );

  return created;
}
