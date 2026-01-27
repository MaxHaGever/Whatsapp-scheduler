import type { Lang, PendingSlot } from "../services/state";
import { formatSlotLine } from "../utils/slotFormatting";

export function slotsMessage(
  lang: Lang,
  slots: PendingSlot[],
  timezone: string,
  offset: number,
  pageSize: number
) {
  if (!slots.length) {
    if (lang === "ru") return "Не нашёл свободных слотов. Попробуйте другую дату.";
    if (lang === "en") return "No available slots found. Please try another date.";
    return "לא מצאתי תורים פנויים. נסו תאריך אחר 🙂";
  }

  const page = slots.slice(offset, offset + pageSize);

  const lines = page
    .map((s, i) => `${offset + i + 1}) ${formatSlotLine(lang, s.startIso, timezone)}`)
    .join("\n");

  const hasMore = offset + pageSize < slots.length;

  if (lang === "ru") {
    return `Нашёл свободные слоты:\n${lines}\n\nОтветьте номером כדי выбрать.${hasMore ? `\nНапишите "more" / "עוד" כדי לראות עוד.` : ""}`;
  }

  if (lang === "en") {
    return `Available slots:\n${lines}\n\nReply with a number to choose.${hasMore ? `\nSend "more" to see more slots.` : ""}`;
  }

  return `מצאתי תורים פנויים:\n${lines}\n\nהשיבו עם מספר כדי לבחור.${hasMore ? `\nכתבו "עוד" כדי לראות עוד תורים.` : ""}`;
}
