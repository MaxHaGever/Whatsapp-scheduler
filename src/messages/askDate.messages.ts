import type { Lang } from "../services/state";

export function askDateMessage(lang: Lang): string {
  if (lang === "ru") {
    return "Напишите, пожалуйста, когда вы хотите прийти (например: «завтра утром», «в следующий вторник»).";
  }
  if (lang === "en") {
    return "Tell me when you’d like to come (e.g. “tomorrow morning”, “next Tuesday”).";
  }
  return 'כתבו בבקשה מתי תרצו להגיע (למשל: "מחר בבוקר", "בראשון הבא").';
}
