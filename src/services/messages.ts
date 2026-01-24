import type { Lang } from "./state";

export function welcomeMessage(): string {
  // Hebrew + Russian line. Keep it short and clinic-friendly.
  return [
    "ברוכים הבאים למרפאה 👋 זהו שירות לקביעת תורים בוואטסאפ.",
    "אנא כתבו מתי תרצו להגיע (למשל: “בראשון הבא בבוקר”).",
    "למידע נוסף ניתן לפנות למרפאה.",
    "",
    "Для русского языка напишите: russian"
  ].join("\n");
}

export function askWhenMessage(lang: Lang): string {
  if (lang === "ru") {
    return "Пожалуйста, напишите когда вы хотите прийти (например: «в следующее воскресенье утром»).";
  }
  return "מעולה 🙂 כתבו בבקשה מתי תרצו להגיע (למשל: “בראשון הבא בבוקר”).";
}

export function didntUnderstandDate(lang: Lang): string {
  if (lang === "ru") {
    return "Я не понял дату. Напишите, пожалуйста, так: «завтра», «в воскресенье», или «29/1».";
  }
  return "לא הצלחתי להבין את התאריך. אפשר לכתוב למשל: “מחר”, “בראשון”, או “29/1”.";
}
