import type { Lang, PendingSlot } from "../services/state";
import { formatSlotLine } from "../utils/slotFormatting";

export function askForDateMessage(lang: Lang) {
  if (lang === "ru") return "Напишите дату/день (например: «завтра утром», «в следующий вторник»).";
  if (lang === "en") return "Tell me a day/date (e.g. “tomorrow morning”, “next Tuesday”).";
  return 'כתבו יום/תאריך (למשל: "מחר בבוקר", "בשישי הבא").';
}

export function slotsMessage(args: {
  lang: Lang;
  slots: PendingSlot[];
  timezone: string;
  offset: number;
  pageSize: number;
}) {
  const { lang, slots, timezone, offset, pageSize } = args;

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
    return `Нашёл свободные слоты:\n${lines}\n\nОтветьте номером כדי выбрать.${
      hasMore ? `\nНапишите "more" / "עוד" כדי увидеть עוד.` : ""
    }`;
  }

  if (lang === "en") {
    return `Available slots:\n${lines}\n\nReply with a number to choose.${
      hasMore ? `\nSend "more" to see more slots.` : ""
    }`;
  }

  return `מצאתי תורים פנויים:\n${lines}\n\nהשיבו עם מספר כדי לבחור.${
    hasMore ? `\nכתבו "עוד" כדי לראות עוד תורים.` : ""
  }`;
}

export function bookedMessage(lang: Lang, label: string) {
  if (lang === "ru") return `✅ Записано: ${label}`;
  if (lang === "en") return `✅ Booked: ${label}`;
  return `✅ נקבע: ${label}`;
}

export function invalidChoiceMessage(lang: Lang) {
  if (lang === "ru") return "לא הבנתי. השיבו מספר מהרשימה או כתבו תאריך אחר.";
  if (lang === "en") return "I didn’t get that. Reply with a number from the list or write another date.";
  return "לא הבנתי 🙂 השיבו מספר מהרשימה או כתבו תאריך אחר.";
}
