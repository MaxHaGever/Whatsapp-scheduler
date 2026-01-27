import type { Lang } from "../services/state";

export function welcomeMessage(lang: Lang) {
  if (lang === "ru") {
    return (
      "Привет 🙂\n" +
      "Я могу помочь с:\n" +
      "• записью на приём\n" +
      "• отменой приёма\n" +
      "• переносом приёма\n\n" +
      "Напишите свободно, что вы хотите сделать."
    );
  }

  if (lang === "en") {
    return (
      "Hi 🙂\n" +
      "I can help with:\n" +
      "• scheduling an appointment\n" +
      "• canceling an appointment\n" +
      "• rescheduling an appointment\n\n" +
      "Just type what you want to do."
    );
  }

  return (
    "היי 🙂\n" +
    "אני יכול לעזור עם:\n" +
    "• קביעת תור\n" +
    "• ביטול תור\n" +
    "• שינוי/הזזת תור\n\n" +
    "פשוט כתבו מה תרצו לעשות."
  );
}
