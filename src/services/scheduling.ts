import { google, calendar_v3 } from "googleapis";
import { DateTime, Interval } from "luxon";
import { getOAuth2Client } from "./googleAuth";

const TZ = process.env.TZ || "Asia/Jerusalem";
const CALENDAR_ID = process.env.GOOGLE_CALENDAR_ID || "primary";

// Clinic working hours (edit later)
const WORK_START_HOUR = Number(process.env.WORK_START_HOUR || 9);   // 09:00
const WORK_END_HOUR = Number(process.env.WORK_END_HOUR || 17);      // 17:00 (end)
const SLOT_MINUTES = Number(process.env.SLOT_MINUTES || 30);

export type Slot = { startIso: string; endIso: string; label: string };

export type ListedAppointment = {
  eventId: string;
  startIso: string;
  summary: string;
};

function calendarClient() {
  const auth = getOAuth2Client();

  // If you store refresh token in env (single-user setup)
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;
  if (!refreshToken) throw new Error("Missing GOOGLE_REFRESH_TOKEN in env");

  auth.setCredentials({ refresh_token: refreshToken });

  return google.calendar({ version: "v3", auth });
}

function toLuxon(dtIso: string) {
  return DateTime.fromISO(dtIso, { zone: TZ });
}

function formatSlotLabel(dt: DateTime, lang: "he" | "ru" | "en") {
  // You asked: Hebrew should not show Tue 03/02; show יום ראשון 25/01
  if (lang === "he") {
    const hebDays = ["יום ראשון", "יום שני", "יום שלישי", "יום רביעי", "יום חמישי", "יום שישי", "יום שבת"];
    const dayName = hebDays[dt.weekday % 7]; // Luxon: Mon=1..Sun=7. We want Sun=0.
    // Luxon Sunday=7 -> 7%7 =0 => "יום ראשון" ✅
    return `${dayName} ${dt.toFormat("dd/LL")} ${dt.toFormat("HH:mm")}`;
  }

  if (lang === "ru") {
    // Simple RU formatting
    return dt.setLocale("ru").toFormat("ccc dd/LL HH:mm");
  }

  return dt.setLocale("en").toFormat("ccc dd/LL HH:mm");
}

/**
 * Returns busy intervals using freeBusy endpoint
 */
async function fetchBusyIntervals(timeMinIso: string, timeMaxIso: string) {
  const cal = calendarClient();

  const res = await cal.freebusy.query({
    requestBody: {
      timeMin: timeMinIso,
      timeMax: timeMaxIso,
      timeZone: TZ,
      items: [{ id: CALENDAR_ID }],
    },
  });

  const busy = res.data.calendars?.[CALENDAR_ID]?.busy || [];
  return busy
    .filter(b => b.start && b.end)
    .map(b => Interval.fromDateTimes(toLuxon(b.start!), toLuxon(b.end!)));
}

/**
 * Build all possible working slots for a day.
 */
function buildDaySlots(dayIsoDate: string) {
  const dayStart = DateTime.fromISO(dayIsoDate, { zone: TZ }).startOf("day");
  const start = dayStart.set({ hour: WORK_START_HOUR, minute: 0, second: 0, millisecond: 0 });
  const end = dayStart.set({ hour: WORK_END_HOUR, minute: 0, second: 0, millisecond: 0 });

  const slots: Interval[] = [];
  let cursor = start;
  while (cursor.plus({ minutes: SLOT_MINUTES }) <= end) {
    slots.push(Interval.fromDateTimes(cursor, cursor.plus({ minutes: SLOT_MINUTES })));
    cursor = cursor.plus({ minutes: SLOT_MINUTES });
  }
  return slots;
}

/**
 * Remove busy from candidate slots.
 */
function filterFreeSlots(daySlots: Interval[], busy: Interval[]) {
  return daySlots.filter(slot => !busy.some(b => b.overlaps(slot)));
}

/**
 * Propose next slots for a given day ISO date (YYYY-MM-DD)
 */
export async function proposeNextSlots(dayIsoDate: string, lang: "he" | "ru" | "en" = "he"): Promise<Slot[]> {
  const dayStart = DateTime.fromISO(dayIsoDate, { zone: TZ }).startOf("day");
  const timeMin = dayStart.toISO()!;
  const timeMax = dayStart.plus({ days: 1 }).toISO()!;

  const busy = await fetchBusyIntervals(timeMin, timeMax);
  const daySlots = buildDaySlots(dayIsoDate);
  const free = filterFreeSlots(daySlots, busy).slice(0, 3);

  return free.map((i) => {
    const s = i.start!;
    const e = i.end!;
    return {
      startIso: s.toISO()!,
      endIso: e.toISO()!,
      label: formatSlotLabel(s, lang),
    };
  });
}

/**
 * Book chosen slot as a calendar event.
 * Adds wa_id in extendedProperties.private so we can list/cancel by WhatsApp user later.
 */
export async function bookChosenSlot(args: {
  waId: string;
  startIso: string;
  endIso: string;
  summary?: string;
}): Promise<{ eventId: string; startIso: string }> {
  const cal = calendarClient();

  const summary = args.summary || "Clinic Appointment";

  const res = await cal.events.insert({
    calendarId: CALENDAR_ID,
    requestBody: {
      summary,
      start: { dateTime: args.startIso, timeZone: TZ },
      end: { dateTime: args.endIso, timeZone: TZ },
      extendedProperties: {
        private: {
          wa_id: args.waId,
          source: "wa-scheduler-bot",
        },
      },
    },
  });

  const eventId = res.data.id;
  if (!eventId) throw new Error("Event created but id missing");

  return { eventId, startIso: args.startIso };
}

/**
 * List upcoming appointments for a specific WhatsApp user.
 * We filter by private extendedProperties.
 */
export async function listUpcomingAppointments(waId: string, maxResults = 10): Promise<ListedAppointment[]> {
  const cal = calendarClient();

  const now = DateTime.now().setZone(TZ).toISO()!;
  const res = await cal.events.list({
    calendarId: CALENDAR_ID,
    timeMin: now,
    maxResults,
    singleEvents: true,
    orderBy: "startTime",
    privateExtendedProperty: [`wa_id=${waId}`], // <- MUST be string[]
  });

  const items = res.data.items || [];
  return items
    .filter((e) => e.id && (e.start?.dateTime || e.start?.date))
    .map((e) => ({
      eventId: e.id!,
      startIso: e.start!.dateTime || DateTime.fromISO(e.start!.date!, { zone: TZ }).toISO()!,
      summary: e.summary || "Clinic Appointment",
    }));
}

export async function cancelAppointmentByEventId(eventId: string): Promise<void> {
  const cal = calendarClient();
  await cal.events.delete({ calendarId: CALENDAR_ID, eventId });
}

/**
 * Helper that proposes slots for the next 3 days if requested day has no slots.
 */
export async function proposeSlotsWithFallback(args: {
  dayIsoDate: string;
  lang: "he" | "ru" | "en";
}): Promise<{ day: string; slots: Slot[] }[]> {
  const base = DateTime.fromISO(args.dayIsoDate, { zone: TZ }).startOf("day");
  const out: { day: string; slots: Slot[] }[] = [];

  for (let i = 0; i < 3; i++) {
    const d = base.plus({ days: i }).toISODate()!;
    const slots = await proposeNextSlots(d, args.lang);
    out.push({ day: d, slots });
  }
  return out;
}

/* ------------------------------------------------------------------
   Compatibility exports (so controllers/routes won’t break again)
------------------------------------------------------------------ */

export const listUserAppointments = listUpcomingAppointments;

export async function cancelUserAppointmentByIndex(waId: string, index: number): Promise<void> {
  const appts = await listUpcomingAppointments(waId);
  const idx = index - 1;
  if (idx < 0 || idx >= appts.length) throw new Error("Invalid appointment index");
  await cancelAppointmentByEventId(appts[idx].eventId);
}

// If older code used bookSlot()
export async function bookSlot(waId: string, startIso: string, endIso: string) {
  return bookChosenSlot({ waId, startIso, endIso });
}
