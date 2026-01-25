import { google } from "googleapis";
import { DateTime, Interval } from "luxon";
import { getOAuth2Client } from "./googleAuth";

const TZ = process.env.APP_TIMEZONE || "Asia/Jerusalem";
const CALENDAR_ID = process.env.GOOGLE_CALENDAR_ID || "primary";

export type Slot = {
  startIso: string; // ISO string
  endIso: string;   // ISO string
  label: string;    // what we show the user
};

function fmtSlotLabel(dt: DateTime, lang: "he" | "ru" | "en" | "unknown") {
  // dd/MM HH:mm always, language only affects day name if you want later
  const day = dt.toFormat("ccc"); // Tue
  const date = dt.toFormat("dd/LL");
  const time = dt.toFormat("HH:mm");
  return `${day} ${date} ${time}`;
}

function buildOAuthClientWithRefreshToken() {
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;
  if (!refreshToken) throw new Error("Missing GOOGLE_REFRESH_TOKEN in env");
  const client = getOAuth2Client();
  client.setCredentials({ refresh_token: refreshToken });
  return client;
}

/**
 * Find available slots for a given date.
 * Uses Google Calendar freeBusy to avoid conflicts (YES: it respects already-booked hours).
 */
export async function proposeNextSlots(params: {
  dateIso: string; // YYYY-MM-DD in TZ
  lang: "he" | "ru" | "en" | "unknown";
  slotMinutes?: number;
  windowStartHour?: number;
  windowEndHour?: number;
  maxSlots?: number;
}): Promise<Slot[]> {
  const {
    dateIso,
    lang,
    slotMinutes = 30,
    windowStartHour = 9,
    windowEndHour = 17,
    maxSlots = 3,
  } = params;

  const auth = buildOAuthClientWithRefreshToken();
  const calendar = google.calendar({ version: "v3", auth });

  const dayStart = DateTime.fromISO(dateIso, { zone: TZ }).set({
    hour: windowStartHour,
    minute: 0,
    second: 0,
    millisecond: 0,
  });

  const dayEnd = DateTime.fromISO(dateIso, { zone: TZ }).set({
    hour: windowEndHour,
    minute: 0,
    second: 0,
    millisecond: 0,
  });

  // Ask Google what is busy that day
  const fb = await calendar.freebusy.query({
    requestBody: {
      timeMin: dayStart.toISO(),
      timeMax: dayEnd.toISO(),
      timeZone: TZ,
      items: [{ id: CALENDAR_ID }],
    },
  });

  const busy = fb.data.calendars?.[CALENDAR_ID]?.busy ?? [];

  // Convert busy to Luxon intervals
  const busyIntervals: Interval[] = busy
    .map((b) => {
      if (!b.start || !b.end) return null;
      const s = DateTime.fromISO(b.start, { zone: TZ });
      const e = DateTime.fromISO(b.end, { zone: TZ });
      return Interval.fromDateTimes(s, e);
    })
    .filter((x): x is Interval => Boolean(x));

  // Walk the day and pick free slots
  const slots: Slot[] = [];
  let cursor = dayStart;

  while (cursor.plus({ minutes: slotMinutes }) <= dayEnd && slots.length < maxSlots) {
    const candidate = Interval.fromDateTimes(cursor, cursor.plus({ minutes: slotMinutes }));

    const overlapsBusy = busyIntervals.some((b) => b.overlaps(candidate));
    if (!overlapsBusy) {
      slots.push({
        startIso: candidate.start!.toISO()!,
        endIso: candidate.end!.toISO()!,
        label: fmtSlotLabel(candidate.start!, lang),
      });
    }

    cursor = cursor.plus({ minutes: slotMinutes });
  }

  return slots;
}

/**
 * Book a slot: creates a calendar event.
 */
export async function bookChosenSlot(params: {
  waId: string;
  startIso: string; // ISO
  endIso: string;   // ISO
  summary?: string;
  description?: string;
}): Promise<{ eventId: string }> {
  const { waId, startIso, endIso, summary = "Clinic Appointment", description = "" } = params;

  const auth = buildOAuthClientWithRefreshToken();
  const calendar = google.calendar({ version: "v3", auth });

  const created = await calendar.events.insert({
    calendarId: CALENDAR_ID,
    requestBody: {
      summary,
      description,
      start: { dateTime: startIso, timeZone: TZ },
      end: { dateTime: endIso, timeZone: TZ },

      // ✅ PUT THIS HERE (you asked where): inside the event body you insert
      extendedProperties: {
        private: {
          wa_id: waId,
          source: "wa-scheduler-bot",
        },
      },
    },
  });

  const eventId = created.data.id;
  if (!eventId) throw new Error("Failed to create event (missing id)");

  return { eventId };
}

/**
 * List upcoming appointments for a WhatsApp user (by wa_id tag).
 */
export async function listUserAppointments(params: {
  waId: string;
  maxResults?: number;
}): Promise<Array<{ eventId: string; startIso: string; summary: string }>> {
  const { waId, maxResults = 10 } = params;

  const auth = buildOAuthClientWithRefreshToken();
  const calendar = google.calendar({ version: "v3", auth });

  const now = DateTime.now().setZone(TZ).toISO();

  const resp = await calendar.events.list({
    calendarId: CALENDAR_ID,
    timeMin: now ?? undefined,
    singleEvents: true,
    orderBy: "startTime",
    maxResults,
  });

  const items = resp.data.items ?? [];

  // Filter only events created by this bot for this wa_id
  const mine = items.filter((e) => {
    const p = e.extendedProperties?.private as Record<string, string> | undefined;
    return p?.source === "wa-scheduler-bot" && p?.wa_id === waId;
  });

  return mine
    .map((e) => {
      const startIso = e.start?.dateTime ?? e.start?.date ?? "";
      return {
        eventId: e.id ?? "",
        startIso,
        summary: e.summary ?? "(no title)",
      };
    })
    .filter((x) => x.eventId && x.startIso);
}

/**
 * Cancel an appointment by eventId (only if it belongs to this wa_id).
 */
export async function cancelUserAppointment(params: {
  waId: string;
  eventId: string;
}): Promise<{ ok: true } | { ok: false; reason: string }> {
  const { waId, eventId } = params;

  const auth = buildOAuthClientWithRefreshToken();
  const calendar = google.calendar({ version: "v3", auth });

  const ev = await calendar.events.get({
    calendarId: CALENDAR_ID,
    eventId,
  });

  const p = ev.data.extendedProperties?.private as Record<string, string> | undefined;
  if (p?.source !== "wa-scheduler-bot" || p?.wa_id !== waId) {
    return { ok: false, reason: "This appointment does not belong to this user." };
  }

  await calendar.events.delete({
    calendarId: CALENDAR_ID,
    eventId,
  });

  return { ok: true };
}
