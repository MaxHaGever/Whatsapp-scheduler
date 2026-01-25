import { DateTime } from "luxon";

export type Lang = "he" | "ru" | "en" | "unknown";

const TZ = process.env.AI_TIMEZONE || "Asia/Jerusalem";

const HE_WEEKDAYS = [
  "יום שני",
  "יום שלישי",
  "יום רביעי",
  "יום חמישי",
  "יום שישי",
  "יום שבת",
  "יום ראשון",
];

// Luxon weekday: 1=Mon ... 7=Sun
function hebrewWeekday(weekday: number): string {
  return HE_WEEKDAYS[(weekday - 1) % 7] ?? "יום";
}

export function formatSlotLine(lang: Lang, startIso: string): string {
  const dt = DateTime.fromISO(startIso, { zone: TZ });
  if (!dt.isValid) return startIso;

  const ddmm = dt.toFormat("dd/LL");
  const hhmm = dt.toFormat("HH:mm");

  if (lang === "he") {
    return `${hebrewWeekday(dt.weekday)} ${ddmm} ${hhmm}`;
  }

  // simple/clean non-hebrew formatting
  return dt.toFormat("ccc dd/LL HH:mm"); // e.g. Mon 26/01 16:00
}
