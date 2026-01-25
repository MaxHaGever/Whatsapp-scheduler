import { google } from "googleapis";
import { DateTime } from "luxon";
import { getOAuth2Client } from "./googleAuth";

const TZ = "Asia/Jerusalem";

function getCalendarClient() {
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;
  if (!refreshToken) throw new Error("Missing GOOGLE_REFRESH_TOKEN");

  const oauth2 = getOAuth2Client();
  oauth2.setCredentials({ refresh_token: refreshToken });

  return google.calendar({ version: "v3", auth: oauth2 });
}

export async function listUpcomingBotEventsForUser(waId: string, maxResults = 5) {
  const calendar = getCalendarClient();

  const resp = await calendar.events.list({
    calendarId: "primary",
    timeMin: DateTime.now().setZone(TZ).toISO()!,
    singleEvents: true,
    orderBy: "startTime",
    maxResults,
    privateExtendedProperty: [`wa_id=${waId}`, `source=wa-scheduler-bot`],
  });

  const items = resp.data.items || [];
  return items
    .filter((e) => e.id && (e.start?.dateTime || e.start?.date))
    .map((e) => ({
      id: e.id as string,
      summary: e.summary || "Appointment",
      startIso: (e.start?.dateTime || e.start?.date) as string,
    }));
}

export async function deleteEvent(eventId: string) {
  const calendar = getCalendarClient();
  await calendar.events.delete({ calendarId: "primary", eventId });
}
