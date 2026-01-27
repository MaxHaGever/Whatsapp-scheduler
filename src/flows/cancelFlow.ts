import { DateTime } from "luxon";
import { getOrCreateUserState, saveUserState } from "../services/state";
import { sendAndStoreTextMessage } from "../services/messageService";
import { getCalendarProviderForBusiness } from "../calendar/calendarService";
import {
  listUpcomingAppointmentsForUser,
  cancelAppointmentRecord,
} from "../services/appointments";

function looksLikeNumberChoice(text: string) {
  return /^[1-9]\d*$/.test(text.trim());
}

function formatApptLine(args: { startIso: string; timezone: string; summary: string }) {
  const dt = DateTime.fromISO(args.startIso).setZone(args.timezone);
  const when = dt.isValid ? dt.toFormat("ccc dd/LL HH:mm") : args.startIso;
  return `${when} — ${args.summary}`;
}

export async function runCancelFlow(args: {
  businessId: string;
  waId: string;
  text: string;
}) {
  const { businessId, waId, text } = args;

  const state = await getOrCreateUserState(businessId, waId);
  const lang = state.preferredLanguage;
  const timezone = process.env.DEFAULT_TZ || "Asia/Jerusalem";

  // Step A: show list if user didn't pick a number yet
  if (!looksLikeNumberChoice(text)) {
    const appts = await listUpcomingAppointmentsForUser({
      businessId,
      waId,
      timezone,
      limit: 10,
    });

    if (!appts.length) {
      const msg =
        lang === "en"
          ? "You have no upcoming appointments to cancel."
          : lang === "ru"
          ? "У вас нет предстоящих встреч для отмены."
          : "אין לך תורים עתידיים לביטול 🙂";

      await sendAndStoreTextMessage({
        businessId,
        waId,
        body: msg,
        meta: { reason: "cancel-none" },
      });

      await saveUserState(businessId, waId, { stage: "IDLE" });
      return;
    }

    const lines = appts
      .map((a, i) =>
        `${i + 1}) ${formatApptLine({
          startIso: a.startIso,
          timezone,
          summary: a.summary ?? "Appointment",
        })}`
      )
      .join("\n");

    const msg =
      lang === "en"
        ? `Which appointment would you like to cancel?\n${lines}\n\nReply with a number.`
        : lang === "ru"
        ? `Какую встречу отменить?\n${lines}\n\nОтветьте номером.`
        : `איזה תור לבטל?\n${lines}\n\nהשיבו עם מספר.`;

    await sendAndStoreTextMessage({
      businessId,
      waId,
      body: msg,
      meta: { reason: "cancel-list" },
    });

    await saveUserState(businessId, waId, { stage: "CANCEL_AWAIT_TARGET" });
    return;
  }

  // Step B: user picked a number -> cancel
  const n = Number(text.trim());
  const appts = await listUpcomingAppointmentsForUser({
    businessId,
    waId,
    timezone,
    limit: 10,
  });

  if (!Number.isFinite(n) || n < 1 || n > appts.length) {
    const msg =
      lang === "en"
        ? "Invalid choice. Reply with a valid number from the list."
        : lang === "ru"
        ? "Неверный выбор. Ответьте корректным номером из списка."
        : "בחירה לא תקינה. השיבו עם מספר מהרשימה 🙂";

    await sendAndStoreTextMessage({
      businessId,
      waId,
      body: msg,
      meta: { reason: "cancel-invalid-choice" },
    });
    return;
  }

  const chosen = appts[n - 1];

  // Cancel in provider
  const provider = await getCalendarProviderForBusiness(businessId);
  await provider.cancelAppointmentByEventId({ eventId: chosen.providerEventId });

  // Mark canceled in DB
  await cancelAppointmentRecord({
    businessId,
    waId,
    providerEventId: chosen.providerEventId,
  });

  const msg =
    lang === "en"
      ? "✅ Canceled."
      : lang === "ru"
      ? "✅ Отменено."
      : "✅ בוטל.";

  await sendAndStoreTextMessage({
    businessId,
    waId,
    body: msg,
    meta: { reason: "cancel-success", eventId: chosen.providerEventId },
  });

  await saveUserState(businessId, waId, { stage: "IDLE" });
}
