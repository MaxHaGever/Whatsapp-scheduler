import type { Lang } from "../services/state";

export function welcomeMessage(lang: Lang): string {
  if (lang === "ru") {
    return (
      "👋 Добро пожаловать в нашу клинику.\n" +
      "Это сервис записи в WhatsApp.\n" +
      "Напишите, когда вы хотите прийти (например: «завтра утром», «в следующий вторник»).\n\n" +
      "Для иврита: напишите Hebrew / עברית\n" +
      "For English: write English"
    );
  }

  if (lang === "en") {
    return (
      "👋 Welcome to our clinic.\n" +
      "This is a WhatsApp scheduling service.\n" +
      "Please tell us when you’d like to visit (e.g. “tomorrow morning”, “next Tuesday”).\n\n" +
      "For Russian: type russian\n" +
      "לעברית: כתבו עברית"
    );
  }

  // he
  return (
    "👋 ברוכים הבאים למרפאה.\n" +
    "זהו שירות קביעת תורים בוואטסאפ.\n" +
    "אנא כתבו מתי תרצו להגיע (לדוגמה: \"מחר בבוקר\", \"בראשון הבא\").\n\n" +
    "לרוסית כתבו: russian\n" +
    "For English: write English"
  );
}
