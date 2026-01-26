import type { Lang } from "../services/state";
import type { PendingSlot } from "../services/state";

export function slotsMessage(lang: Lang, slots: PendingSlot[]): string {
  if (!slots.length) {
    if (lang === "ru") return "Не нашёл свободных слотов. Попробуйте другой день.";
    if (lang === "en") return "No available slots found. Please try another day.";
    return "לא מצאתי תורים פנויים. נסו תאריך אחר.";
  }

  const lines = slots.map((s, i) => `${i + 1}) ${s.label}`).join("\n");

  if (lang === "ru") {
    return `Нашёл свободные слоты:\n${lines}\n\nОтветьте 1 / 2 / 3 כדי לבחור.\nאפשר גם לכתוב יום אחר (למשל: "חמישי")`;
  }

  if (lang === "en") {
    return `Available slots:\n${lines}\n\nReply 1 / 2 / 3 to choose.\nYou can also type another day (e.g. “Thursday”)`;
  }

  return `מצאתי תורים פנויים:\n${lines}\n\nהשיבו עם 1/2/3 כדי לבחור.\nאפשר גם לכתוב יום אחר (למשל: "חמישי")`;
}
