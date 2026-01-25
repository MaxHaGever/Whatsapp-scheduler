import { google } from "googleapis";
import { DateTime, Interval } from "luxon";
import { getOAuth2Client } from "./googleAuth";
import type { PendingSlot } from "../models/UserState";

const TZ = "Asia/Jerusalem";

function getCalendar() {
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;
  if (!refreshToken) throw new Error("Missing GOOGLE_REFRESH_TOKEN");

  const oauth2 = getOAuth2Client();
  oauth2.setCredentials({ refresh_token: refreshToken });

  return google.calendar({ version: "v3", auth: oauth2 });
}

function overlaps(aStart: string, aEnd: string, bStart: string, bEnd: string) {
  const a = Interval.fromDateTimes(DateTime.fromISO(aStart), DateTime.fromISO(aEnd));
  const b = Interval.fromDateTimes(DateTime.fromISO(bStart), DateTime.fromISO(bEnd));
  return a.overlaps(b);
}

/**
 * Returns up to 3 available slots in the requested window.
 */
export async function proposeSlotsInWindow(
  _waId: string,
  timeMinIso: string,
  timeMaxIso: string,
  slotMinutes = 30
): Promise<{ slots: PendingSlot[]; messageText: string }> {
  const calendar = getCalendar();

  // Ask Google what is busy in this window
  const fb = await calendar.freebusy.query({
    requestBody: {
      timeMin: timeMinIso,
      timeMax: timeMaxIso,
      timeZone: TZ,
      items: [{ id: "primary" }],
    },
  });

  const busy = fb.data.calendars?.primary?.busy || [];

  const start = DateTime.fromISO(timeMinIso, { zone: TZ });
  const end = DateTime.fromISO(timeMaxIso, { zone: TZ });

  const slots: PendingSlot[] = [];
  let cursor = start;

  // Generate candidate slots on the clock
  while (cursor.plus({ minutes: slotMinutes }) <= end) {
    const s = cursor;
    const e = cursor.plus({ minutes: slotMinutes });

    const sIso = s.toISO()!;
    const eIso = e.toISO()!;

    const isBusy = busy.some((b) => overlaps(sIso, eIso, b.start!, b.end!));
    if (!isBusy) {
      const label = s.toFormat("ccc dd/LL HH:mm"); // e.g. Sun 25/01 10:00
      slots.push({ startIso: sIso, endIso: eIso, label });
      if (slots.length >= 3) break;
    }

    cursor = cursor.plus({ minutes: slotMinutes });
  }

  if (slots.length === 0) {
    return {
      slots: [],
      messageText: "אין תורים פנויים בטווח הזה 😕\nשלח/י תאריך אחר או זמן אחר.",
    };
  }

  const lines = slots.map((s, i) => `${i + 1}) ${s.label}`);
  return {
    slots,
    messageText: `מצאתי תורים פנויים:\n${lines.join("\n")}\n\nהשב/י עם 1 / 2 / 3 כדי לבחור.`,
  };
}

/**
 * Books a chosen slot into Google Calendar.
 * IMPORTANT: tags the event with wa_id so cancel works later.
 */
export async function bookSlot(waId: string, slot: PendingSlot): Promise<string> {
  const calendar = getCalendar();

  const start = DateTime.fromISO(slot.startIso, { zone: TZ });
  const end = DateTime.fromISO(slot.endIso, { zone: TZ });

  const resp = await calendar.events.insert({
    calendarId: "primary",
    requestBody: {
      summary: "Clinic Appointment",
      description: `Booked via WhatsApp bot for wa_id=${waId}`,
      start: { dateTime: start.toISO()!, timeZone: TZ },
      end: { dateTime: end.toISO()!, timeZone: TZ },

      // ✅ THIS IS EXACTLY WHERE IT GOES
      extendedProperties: {
        private: {
          wa_id: waId,
          source: "wa-scheduler-bot",
        },
      },
    },
  });

  const eventId = resp.data.id;
  return `נקבע ✅\n${start.toFormat("ccc dd/LL HH:mm")}\n(מספר אירוע: ${eventId})`;
}
