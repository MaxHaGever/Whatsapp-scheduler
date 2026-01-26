import type { Lang } from "../services/state";

export function noSlotsMessage(lang: Lang): string {
  if (lang === "ru") return "לא מצאתי תורים פנויים ביום הזה. נסו תאריך אחר.";
  if (lang === "en") return "I couldn’t find available slots on that day. Try another date.";
  return "לא מצאתי תורים פנויים ביום הזה. נסו תאריך אחר.";
}
