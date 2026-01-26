import type { Lang } from "../services/state";

export function calendarNotConnectedMessage(lang: Lang): string {
  if (lang === "ru") {
    return (
      "⚠️ Календарь ещё не подключён.\n" +
      "Пожалуйста, попросите администратора подключить Google Calendar.\n" +
      "Пока что я не могу предложить свободные слоты."
    );
  }

  if (lang === "en") {
    return (
      "⚠️ Calendar is not connected yet.\n" +
      "Please ask the admin to connect Google Calendar.\n" +
      "For now, I can’t propose available slots."
    );
  }

  // he
  return (
    "⚠️ הי! עדיין לא חיברו לוח שנה למערכת.\n" +
    "בבקשה בקשו ממנהל/ת המרפאה לחבר Google Calendar.\n" +
    "כרגע אני לא יכול להציע תורים פנויים."
  );
}
