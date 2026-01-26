import { getCalendarProviderForBusiness } from "../calendar/calendarService";
import type { PendingSlot } from "./state";

export async function proposeSlotsForBusiness(args: {
  businessId: string;
  dayIsoDate: string; // YYYY-MM-DD
  timezone: string;
  maxSlots?: number;
}): Promise<PendingSlot[]> {
  const provider = await getCalendarProviderForBusiness(args.businessId);

  const slots = await provider.proposeSlots({
    dayIsoDate: args.dayIsoDate,
    timezone: args.timezone,
    maxSlots: args.maxSlots ?? 3,
  });

  return slots;
}

/**
 * Booking is optional right now.
 * If your provider already supports booking -> enable this.
 * Otherwise we "pretend booked" for now (until you implement booking).
 */
export async function bookSlotForBusiness(args: {
  businessId: string;
  waId: string;
  startIso: string;
  endIso: string;
  summary?: string;
}) {
  const provider = await getCalendarProviderForBusiness(args.businessId);

  // If you added bookSlot to CalendarProvider, call it:
  if ("bookSlot" in provider && typeof (provider as any).bookSlot === "function") {
    return (provider as any).bookSlot({
      waId: args.waId,
      startIso: args.startIso,
      endIso: args.endIso,
      summary: args.summary ?? "Clinic Appointment",
    });
  }

  // Otherwise: do nothing (temporary)
  return null;
}
