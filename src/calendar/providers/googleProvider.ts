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
     * This is a very basic version:
     * - working hours: 09:00–17:00
     * - slot duration: 30 minutes
     * - finds first N free slots that don't overlap existing events
     */
    async proposeSlots({
      dayIsoDate,
      timezone,
      maxSlots = 3,
    }: ProposeSlotsArgs): Promise<Slot[]> {
      const slotMinutes = 30;

      // Define working hours
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
        throw new Error(`Invalid dayIsoDate or timezone. dayIsoDate=${dayIsoDate}, timezone=${timezone}`);
      }

      const auth = await getClient();

      // Fetch events in that day
      const resp = await calendar.events.list({
        auth,
        calendarId: args.calendarId,
        timeMin: startOfDay.toISO() ?? undefined,
        timeMax: endOfDay.toISO() ?? undefined,
        singleEvents: true,
        orderBy: "startTime",
      });

      // Build busy intervals
      const busyIntervals: Interval[] =
        resp.data.items
          ?.map((ev) => {
            const s = ev.start?.dateTime;
            const e = ev.end?.dateTime;
            if (!s || !e) return null;

            const start = DateTime.fromISO(s);
            const end = DateTime.fromISO(e);

            if (!start.isValid || !end.isValid) return null;

            return Interval.fromDateTimes(start, end);
          })
          .filter((x): x is Interval => Boolean(x)) ?? [];

      const slots: Slot[] = [];

      let cursor = startOfDay;

      while (
        cursor.plus({ minutes: slotMinutes }) <= endOfDay &&
        slots.length < maxSlots
      ) {
        const candidate = Interval.fromDateTimes(
          cursor,
          cursor.plus({ minutes: slotMinutes })
        );

        const overlaps = busyIntervals.some((busy) => busy.overlaps(candidate));

        if (!overlaps) {
          const start = candidate.start;
          const end = candidate.end;

          // Luxon types allow null here, so guard
          if (start && end) {
            slots.push({
              startIso: start.toISO()!,
              endIso: end.toISO()!,
              label: formatSlotLabel(start, timezone),
            });
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
     * (for now returns the next N events; later we can filter by waId in description)
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

      // Optional future filtering:
      // - Only include events that contain "waId=<id>" in description
      // For now, keep simple.
      void waId;

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
