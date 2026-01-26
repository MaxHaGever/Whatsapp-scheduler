import type { Lang, PendingSlot } from "../services/state";

export function askForDateMessage(lang: Lang) {
  if (lang === "ru") return "Напишите дату/день (например: «завтра утром», «в следующий вторник»).";
  if (lang === "en") return "Tell me a day/date (e.g. “tomorrow morning”, “next Tuesday”).";
  return 'כתבו יום/תאריך (למשל: "מחר בבוקר", "בראשון הבא").';
}

export function slotsMessage(lang: Lang, slots: PendingSlot[]) {
  if (!slots.length) {
    if (lang === "ru") return "Не нашёл свободных слотов. Попробуйте другую дату.";
    if (lang === "en") return "No available slots found. Please try another date.";
    return "לא מצאתי תורים פנויים. נסו תאריך אחר 🙂";
  }

  const lines = slots.map((s, i) => `${i + 1}) ${s.label}`).join("\n");

  if (lang === "ru") {
    return `Нашёл свободные слоты:\n${lines}\n\nОтветьте 1/2/3 כדי выбрать или напишите другую дату.`;
  }

  if (lang === "en") {
    return `Available slots:\n${lines}\n\nReply 1/2/3 to choose, or write another date.`;
  }

  return `מצאתי תורים פנויים:\n${lines}\n\nהשיבו עם 1/2/3 כדי לבחור או כתבו תאריך אחר.`;
}

export function bookedMessage(lang: Lang, label: string) {
  if (lang === "ru") return `✅ Записано: ${label}`;
  if (lang === "en") return `✅ Booked: ${label}`;
  return `✅ נקבע: ${label}`;
}

export function invalidChoiceMessage(lang: Lang) {
  if (lang === "ru") return "לא הבנתי. השיבו 1/2/3 או כתבו תאריך אחר.";
  if (lang === "en") return "I didn’t get that. Reply 1/2/3 or write another date.";
  return "לא הבנתי 🙂 השיבו 1/2/3 או כתבו תאריך אחר.";
}
