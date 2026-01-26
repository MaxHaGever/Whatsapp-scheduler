export type Slot = {
  startIso: string;
  endIso: string;
  label: string;
};

export type Appointment = {
  eventId: string;
  startIso: string;
  endIso: string;
  summary: string;
};

export type ProposeSlotsArgs = {
  dayIsoDate: string; // "YYYY-MM-DD"
  timezone: string;   // "Asia/Jerusalem"
  maxSlots?: number;
};

export type BookSlotArgs = {
  waId: string;
  startIso: string;
  endIso: string;
  summary: string;
  timezone: string;
};

export interface CalendarProvider {
  proposeSlots(args: ProposeSlotsArgs): Promise<Slot[]>;
  bookSlot(args: BookSlotArgs): Promise<{ eventId: string }>;
  listUpcomingAppointments(args: { waId: string; limit?: number; timezone: string }): Promise<Appointment[]>;
  cancelAppointmentByEventId(args: { eventId: string }): Promise<void>;
}
