import { DateTime } from "luxon";
import { AppointmentModel } from "../models/Appointment";

export async function createAppointmentRecord(args: {
  businessId: string;
  waId: string;
  provider: "google";
  providerEventId: string;
  startIso: string;
  endIso: string;
  summary?: string;
}) {
  return AppointmentModel.create({
    businessId: args.businessId,
    waId: args.waId,
    provider: args.provider,
    providerEventId: args.providerEventId,
    startIso: args.startIso,
    endIso: args.endIso,
    summary: args.summary ?? "Appointment",
    status: "booked",
  });
}

export async function listUpcomingAppointmentsForUser(args: {
  businessId: string;
  waId: string;
  timezone: string;
  limit?: number;
}) {
  const nowIso = DateTime.now().setZone(args.timezone).toISO() ?? new Date().toISOString();

  return AppointmentModel.find({
    businessId: args.businessId,
    waId: args.waId,
    status: "booked",
    startIso: { $gte: nowIso },
  })
    .sort({ startIso: 1 })
    .limit(args.limit ?? 10)
    .lean();
}

export async function cancelAppointmentRecord(args: {
  businessId: string;
  waId: string;
  providerEventId: string;
}) {
  const nowIso = new Date().toISOString();
  await AppointmentModel.updateOne(
    { businessId: args.businessId, waId: args.waId, providerEventId: args.providerEventId },
    { $set: { status: "canceled", canceledAtIso: nowIso } }
  );
}
