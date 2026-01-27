import { google } from "googleapis";
import { DateTime, Interval } from "luxon";
import type {
  CalendarProvider,
  ProposeSlotsArgs,
  BookSlotArgs,
  Slot,
  Appointment,
} from "./CalendarProvider";
import { getOAuth2Client } from "../../services/googleAuth";

/**
 * Google Calendar Provider (implements CalendarProvider)
 * Uses a refresh token (stored per business later).
 */
export function createGoogleProvider(args: {
  refreshToken: string;
  calendarId: string;
}): CalendarProvider {
  const calendar = google.calendar("v3");

  async function getClient() {
    const client = getOAuth2Client();
    client.setCredentials({ refresh_token: args.refreshToken });
    return client;
  }

  function formatSlotLabel(start: DateTime, timezone: string) {
    return start.setZone(timezone).toFormat("ccc dd/LL HH:mm");
  }

  return {
    /**
     * Propose available time slots in a given day.
     * - working hours: 09:00–17:00
     * - slot duration: 30 minutes
     * - if maxSlots is undefined => returns ALL free slots for that day
     */
    async proposeSlots({ dayIsoDate, timezone, maxSlots }: ProposeSlotsArgs): Promise<Slot[]> {
      const slotMinutes = 30;

      const startOfDay = DateTime.fromISO(dayIsoDate, { zone: timezone }).set({
        hour: 9,
        minute: 0,
        second: 0,
        millisecond: 0,
      });

      const endOfDay = DateTime.fromISO(dayIsoDate, { zone: timezone }).set({
        hour: 17,
        minute: 0,
        second: 0,
        millisecond: 0,
      });

      if (!startOfDay.isValid || !endOfDay.isValid) {
        throw new Error(
          `Invalid dayIsoDate or timezone. dayIsoDate=${dayIsoDate}, timezone=${timezone}`
        );
      }

      const auth = await getClient();

      const resp = await calendar.events.list({
        auth,
        calendarId: args.calendarId,
        timeMin: startOfDay.toISO() ?? undefined,
        timeMax: endOfDay.toISO() ?? undefined,
        singleEvents: true,
        orderBy: "startTime",
      });

      const items = resp.data.items ?? [];

      // ✅ Build busy intervals (supports dateTime AND all-day date)
      const busyIntervals: Interval[] = items
        .map((ev) => {
          const startRaw = ev.start?.dateTime ?? ev.start?.date;
          const endRaw = ev.end?.dateTime ?? ev.end?.date;
          if (!startRaw || !endRaw) return null;

          const start = DateTime.fromISO(startRaw, { zone: timezone });
          const end = DateTime.fromISO(endRaw, { zone: timezone });

          if (!start.isValid || !end.isValid) return null;

          return Interval.fromDateTimes(start, end);
        })
        .filter((x): x is Interval => Boolean(x));

      const slots: Slot[] = [];
      let cursor = startOfDay;

      while (cursor.plus({ minutes: slotMinutes }) <= endOfDay) {
        const candidate = Interval.fromDateTimes(cursor, cursor.plus({ minutes: slotMinutes }));

        const overlaps = busyIntervals.some((busy) => busy.overlaps(candidate));

        if (!overlaps) {
          const start = candidate.start;
          const end = candidate.end;

          if (start && end) {
            slots.push({
              startIso: start.toISO()!,
              endIso: end.toISO()!,
              label: formatSlotLabel(start, timezone),
            });

            // ✅ cap only if maxSlots was provided
            if (typeof maxSlots === "number" && maxSlots > 0 && slots.length >= maxSlots) {
              break;
            }
          }
        }

        cursor = cursor.plus({ minutes: slotMinutes });
      }

      return slots;
    },

    /**
     * Book a chosen slot
     */
    async bookSlot({ waId, startIso, endIso, summary, timezone }: BookSlotArgs) {
      const auth = await getClient();

      const resp = await calendar.events.insert({
        auth,
        calendarId: args.calendarId,
        requestBody: {
          summary,
          description: `Booked via WhatsApp | waId=${waId}`,
          start: { dateTime: startIso, timeZone: timezone },
          end: { dateTime: endIso, timeZone: timezone },
        },
      });

      const eventId = resp.data.id;
      if (!eventId) throw new Error("Google event insert succeeded but returned no event id");

      return { eventId };
    },

    /**
     * List upcoming appointments
     */
    async listUpcomingAppointments({ waId, limit = 10, timezone }) {
      const auth = await getClient();

      const now = DateTime.now().setZone(timezone);

      const resp = await calendar.events.list({
        auth,
        calendarId: args.calendarId,
        timeMin: now.toISO() ?? undefined,
        singleEvents: true,
        orderBy: "startTime",
        maxResults: limit,
      });

      const items = resp.data.items ?? [];

      const appts: Appointment[] = items
        .filter((ev) => ev.id && ev.start?.dateTime && ev.end?.dateTime)
        .map((ev) => ({
          eventId: ev.id!,
          startIso: ev.start!.dateTime!,
          endIso: ev.end!.dateTime!,
          summary: ev.summary ?? "Appointment",
        }));

      void waId; // later we can filter by description containing waId

      return appts;
    },

    /**
     * Cancel appointment by eventId
     */
    async cancelAppointmentByEventId({ eventId }) {
      const auth = await getClient();

      await calendar.events.delete({
        auth,
        calendarId: args.calendarId,
        eventId,
      });
    },
  };
}
