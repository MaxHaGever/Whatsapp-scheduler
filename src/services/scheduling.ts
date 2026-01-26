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

  // Your provider Slot type matches PendingSlot shape (startIso/endIso/label)
  return slots;
}

export async function bookSlotForBusiness(args: {
  businessId: string;
  waId: string;
  startIso: string;
  endIso: string;
  timezone: string;
  summary?: string;
}): Promise<{ eventId: string }> {
  const provider = await getCalendarProviderForBusiness(args.businessId);

  return provider.bookSlot({
    waId: args.waId,
    startIso: args.startIso,
    endIso: args.endIso,
    timezone: args.timezone,
    summary: args.summary ?? "Clinic Appointment",
  });
}
