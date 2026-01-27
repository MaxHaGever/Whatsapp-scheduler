import { DateTime } from "luxon";

const HE_MAP: Record<string, number> = {
  "ראשון": 7,
  "שני": 1,
  "שלישי": 2,
  "רביעי": 3,
  "חמישי": 4,
  "שישי": 5,
  "שבת": 6,
};

function findHebrewWeekday(text: string): number | null {
  for (const [k, v] of Object.entries(HE_MAP)) {
    if (text.includes(k)) return v; // Luxon weekday: Mon=1..Sun=7
  }
  return null;
}

export function tryParseNextWeekdayIso(textRaw: string, timezone: string): string | null {
  const t = textRaw.trim();

  const weekday = findHebrewWeekday(t);
  if (!weekday) return null;

  // treat "הבא" / "קרוב" / just weekday as "next occurrence"
  const now = DateTime.now().setZone(timezone).startOf("day");

  // compute next occurrence strictly after today
  let cursor = now.plus({ days: 1 });
  for (let i = 0; i < 14; i++) {
    if (cursor.weekday === weekday) return cursor.toISODate();
    cursor = cursor.plus({ days: 1 });
  }

  return null;
}
