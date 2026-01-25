import type { Lang } from "../models/UserState";

export function welcomeMessage(): string {
  return (
    "ברוכים הבאים למרפאה 👋\n" +
    "זהו שירות קביעת תורים בוואטסאפ.\n\n" +
    "אנא כתבו מתי תרצו להגיע (לדוגמה: 'מחר בבוקר', 'בראשון הבא').\n\n" +
    "לרוסית כתבו: russian"
  );
}

export function askWhenMessage(lang: Lang): string {
  if (lang === "ru") return "Привет! Напишите, пожалуйста, когда вам удобно прийти (например: 'завтра утром').";
  if (lang === "en") return "Hi! Tell me when you'd like to come (e.g. 'tomorrow morning').";
  return "מעולה 🙂 כתבו מתי תרצו להגיע (לדוגמה: 'מחר בבוקר', 'בראשון הבא').";
}

export function didntUnderstandDate(lang: Lang): string {
  if (lang === "ru") return "Не понял дату. Напишите день более точно (например: 'в следующий понедельник утром').";
  if (lang === "en") return "I couldn't understand the date. Please try again (e.g. 'next Monday morning').";
  return "לא הבנתי את התאריך. נסו שוב (למשל: 'בראשון הבא', 'מחר בבוקר').";
}

export function cancelPrompt(lang: Lang, lines: string[]): string {
  if (lang === "ru") return `Какую запись отменить?\n${lines.join("\n")}\n\nОтветьте цифрой.`;
  if (lang === "en") return `Which appointment should I cancel?\n${lines.join("\n")}\n\nReply with the number.`;
  return `איזה תור לבטל?\n${lines.join("\n")}\n\nהשב/י עם המספר.`;
}

export function noAppointmentsToCancel(lang: Lang): string {
  if (lang === "ru") return "Нет ближайших записей для отмены.";
  if (lang === "en") return "No upcoming appointments to cancel.";
  return "אין כרגע תורים עתידיים לביטול.";
}
