import { DateTime } from "luxon";

const TZ = process.env.AI_TIMEZONE || "Asia/Jerusalem";

function hebrewWeekday(dt: DateTime): string {
  // Luxon with he locale often returns "יום ראשון" etc. But we keep a fallback map.
  const fallback = ["", "יום שני", "יום שלישי", "יום רביעי", "יום חמישי", "יום שישי", "יום שבת", "יום ראשון"];
  const asHe = dt.setLocale("he").toFormat("cccc"); // sometimes returns "יום ראשון" / "ראשון"
  if (asHe.includes("יום")) return asHe;
  if (dt.weekday >= 1 && dt.weekday <= 7) return fallback[dt.weekday];
  return "יום";
}

function russianWeekday(dt: DateTime): string {
  // e.g. "воскресенье"
  return dt.setLocale("ru").toFormat("cccc");
}

function englishWeekday(dt: DateTime): string {
  return dt.setLocale("en").toFormat("cccc");
}

export function formatDateDayLabel(dateIso: string, language: "he" | "ru" | "en" | "unknown"): string {
  const dt = DateTime.fromISO(dateIso, { zone: TZ });
  const ddmm = dt.toFormat("dd/LL");

  if (language === "he") return `${hebrewWeekday(dt)} ${ddmm}`;
  if (language === "ru") return `${russianWeekday(dt)} ${ddmm}`;
  if (language === "en") return `${englishWeekday(dt)} ${ddmm}`;
  return `${dt.toFormat("ccc")} ${ddmm}`;
}

export function formatSlotLabel(
  startIso: string,
  language: "he" | "ru" | "en" | "unknown"
): string {
  const dt = DateTime.fromISO(startIso, { zone: TZ });
  const day = formatDateDayLabel(dt.toISODate()!, language);
  const time = dt.toFormat("HH:mm");
  return `${day} ${time}`;
}
