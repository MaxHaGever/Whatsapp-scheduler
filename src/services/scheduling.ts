import { getCalendarProviderForBusiness } from "../calendar/calendarService";
import type { Slot, Appointment } from "../calendar/providers/CalendarProvider";

export type { Slot };

/**
 * Propose slots with a fallback strategy:
 * - Try the requested day
 * - If no slots, try next day
 * - If still none, return empty
 */
export async function proposeSlotsWithFallback(args: {
  businessId: string;
  dayIsoDate: string; // YYYY-MM-DD
  timezone: string;
  maxSlots?: number;
}): Promise<{ day: string; slots: Slot[] }[]> {
  const provider = await getCalendarProviderForBusiness(args.businessId);

  const maxSlots = args.maxSlots ?? 3;

  // ✅ Try requested day
  const slotsDay1 = await provider.proposeSlots({
    dayIsoDate: args.dayIsoDate,
    timezone: args.timezone,
    maxSlots,
  });

  // ✅ Simple fallback: next day
  const nextDay = addDaysIso(args.dayIsoDate, 1);

  const slotsDay2 = await provider.proposeSlots({
    dayIsoDate: nextDay,
    timezone: args.timezone,
    maxSlots,
  });

  return [
    { day: args.dayIsoDate, slots: slotsDay1 },
    { day: nextDay, slots: slotsDay2 },
  ];
}

/**
 * Book a chosen slot in the business calendar.
 */
export async function bookChosenSlot(args: {
  businessId: string;
  waId: string;
  startIso: string;
  endIso: string;
  summary: string;
  timezone: string;
}): Promise<{ eventId: string }> {
  const provider = await getCalendarProviderForBusiness(args.businessId);

  return provider.bookSlot({
    waId: args.waId,
    startIso: args.startIso,
    endIso: args.endIso,
    summary: args.summary,
    timezone: args.timezone,
  });
}

/**
 * List upcoming appointments.
 * Note: for now it returns the next N events.
 * Later we can filter "only events belonging to waId" (recommended).
 */
export async function listUpcomingAppointments(args: {
  businessId: string;
  waId: string;
  timezone: string;
  limit?: number;
}): Promise<Appointment[]> {
  const provider = await getCalendarProviderForBusiness(args.businessId);

  return provider.listUpcomingAppointments({
    waId: args.waId,
    timezone: args.timezone,
    limit: args.limit ?? 10,
  });
}

/**
 * Cancel an appointment by eventId.
 */
export async function cancelAppointmentByEventId(args: {
  businessId: string;
  eventId: string;
}): Promise<void> {
  const provider = await getCalendarProviderForBusiness(args.businessId);

  return provider.cancelAppointmentByEventId({
    eventId: args.eventId,
  });
}

/**
 * Helper: add days to ISO date string YYYY-MM-DD
 */
function addDaysIso(dayIsoDate: string, days: number): string {
  const [y, m, d] = dayIsoDate.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);

  const yyyy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}
