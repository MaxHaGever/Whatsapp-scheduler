import { getCalendarProviderForBusiness } from "../calendar/calendarService";

export async function proposeSlotsWithFallback(args: {
  businessId: string;
  dayIsoDate: string;
  timezone: string;
}) {
  const provider = await getCalendarProviderForBusiness(args.businessId);

  const slots = await provider.proposeSlots({
    dayIsoDate: args.dayIsoDate,
    timezone: args.timezone,
    maxSlots: 3,
  });

  return slots;
}
