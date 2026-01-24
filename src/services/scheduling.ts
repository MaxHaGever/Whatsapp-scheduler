import { DateTime, Interval } from "luxon";
import { google } from "googleapis";
import { getOAuth2Client } from "./googleAuth";

const TZ = "Asia/Jerusalem";

type Slot = { startIso: string; endIso: string; label: string };

// naive in-memory “conversation state” keyed by WhatsApp user id
const pendingSlotsByUser = new Map<string, Slot[]>();

function getCalendarClient(refreshToken: string) {
  const oauth2 = getOAuth2Client();
  oauth2.setCredentials({ refresh_token: refreshToken });
  return google.calendar({ version: "v3", auth: oauth2 });
}

export async function proposeNextSlots(fromWaId: string, durationMins = 30): Promise<string> {
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;
  const calendarId = process.env.GOOGLE_CALENDAR_ID || "primary";
  if (!refreshToken) throw new Error("Missing GOOGLE_REFRESH_TOKEN");

  const calendar = getCalendarClient(refreshToken);

  // Search window: next 3 days, business hours 09:00–17:00
  const now = DateTime.now().setZone(TZ);
  const startWindow = now.plus({ minutes: 5 });
  const endWindow = now.plus({ days: 3 });

  // Pull busy blocks via FreeBusy
  const fb = await calendar.freebusy.query({
    requestBody: {
      timeMin: startWindow.toISO(),
      timeMax: endWindow.toISO(),
      timeZone: TZ,
      items: [{ id: calendarId }]
    }
  });

  const busy = (fb.data.calendars?.[calendarId]?.busy || []).map(b =>
    Interval.fromDateTimes(DateTime.fromISO(b.start!, { zone: TZ }), DateTime.fromISO(b.end!, { zone: TZ }))
  );

  const slots: Slot[] = [];
  let cursor = startWindow;

  while (cursor < endWindow && slots.length < 3) {
    // enforce business hours
    const dayStart = cursor.startOf("day").set({ hour: 9, minute: 0 });
    const dayEnd = cursor.startOf("day").set({ hour: 17, minute: 0 });

    if (cursor < dayStart) cursor = dayStart;
    if (cursor >= dayEnd) {
      cursor = cursor.plus({ days: 1 }).startOf("day").set({ hour: 9, minute: 0 });
      continue;
    }

    const slotStart = cursor;
    const slotEnd = cursor.plus({ minutes: durationMins });

    // if slot exceeds business hours, jump to next day
    if (slotEnd > dayEnd) {
      cursor = cursor.plus({ days: 1 }).startOf("day").set({ hour: 9, minute: 0 });
      continue;
    }

    const candidate = Interval.fromDateTimes(slotStart, slotEnd);

    const overlapsBusy = busy.some(b => b.overlaps(candidate));
    if (!overlapsBusy) {
      slots.push({
        startIso: slotStart.toISO()!,
        endIso: slotEnd.toISO()!,
        label: slotStart.toFormat("ccc dd/MM HH:mm")
      });
      cursor = cursor.plus({ minutes: durationMins }); // next candidate
    } else {
      cursor = cursor.plus({ minutes: 10 }); // step forward and try again
    }
  }

  if (slots.length === 0) {
    pendingSlotsByUser.delete(fromWaId);
    return "I couldn’t find free slots in the next 3 days (09:00–17:00). Try again later or tell me a day/time range.";
  }

  pendingSlotsByUser.set(fromWaId, slots);

  const lines = slots.map((s, i) => `${i + 1}) ${s.label}`).join("\n");
  return `Here are 3 available slots (Asia/Jerusalem):\n${lines}\n\nReply with 1, 2, or 3 to book.`;
}

export async function bookChosenSlot(fromWaId: string, choice: number): Promise<string> {
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;
  const calendarId = process.env.GOOGLE_CALENDAR_ID || "primary";
  if (!refreshToken) throw new Error("Missing GOOGLE_REFRESH_TOKEN");

  const slots = pendingSlotsByUser.get(fromWaId);
  if (!slots || slots.length === 0) return "No slots pending. Send 'slots' to get options.";

  const idx = choice - 1;
  const slot = slots[idx];
  if (!slot) return "Invalid choice. Reply with 1, 2, or 3.";

  const calendar = getCalendarClient(refreshToken);

  const event = await calendar.events.insert({
    calendarId,
    requestBody: {
      summary: "Meeting (booked via WhatsApp bot)",
      description: `Booked by WhatsApp user ${fromWaId}`,
      start: { dateTime: slot.startIso, timeZone: TZ },
      end: { dateTime: slot.endIso, timeZone: TZ }
    }
  });

  pendingSlotsByUser.delete(fromWaId);

  return `✅ Booked! ${slot.label}\nEvent id: ${event.data.id}`;
}
