import { google } from "googleapis";
import { getOAuth2Client } from "./googleAuth";

export async function createTestEvent(refreshToken: string) {
  const calendarId = process.env.GOOGLE_CALENDAR_ID || "primary";

  const oauth2 = getOAuth2Client();
  oauth2.setCredentials({ refresh_token: refreshToken });

  const calendar = google.calendar({ version: "v3", auth: oauth2 });

  const start = new Date(Date.now() + 10 * 60 * 1000); // 10 mins from now
  const end = new Date(start.getTime() + 30 * 60 * 1000); // +30 mins

  const event = await calendar.events.insert({
    calendarId,
    requestBody: {
      summary: "WhatsApp Scheduler Bot - Test Event",
      description: "Created by the bot ✅",
      start: { dateTime: start.toISOString(), timeZone: "Asia/Jerusalem" },
      end: { dateTime: end.toISOString(), timeZone: "Asia/Jerusalem" }
    }
  });

  return event.data;
}
