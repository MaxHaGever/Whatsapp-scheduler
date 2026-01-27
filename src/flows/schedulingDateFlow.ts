import { getOrCreateUserState, saveUserState } from "../services/state";
import { sendAndStoreTextMessage } from "../services/messageService";
import { askForDateMessage, slotsMessage } from "../messages/scheduling.messages";
import { extractDateIntent } from "../ai/date/extractDateIntent";
import { proposeSlotsForBusiness } from "../services/scheduling";
import { getCalendarProviderForBusiness } from "../calendar/calendarService";
import { tryParseNextWeekdayIso } from "../nlp/weekdayParser";

function isCalendarNotConnectedError(err: any): boolean {
  const msg = String(err?.message ?? "");
  return (
    msg.includes("No active calendar connection") ||
    msg.includes("refresh token missing") ||
    msg.includes("not connected") ||
    msg.includes("Google refresh token missing")
  );
}

export async function runSchedulingDateFlow(args: {
  businessId: string;
  waId: string;
  text: string;
}) {
  const { businessId, waId, text } = args;

  const state = await getOrCreateUserState(businessId, waId);
  const lang = state.preferredLanguage;
  const timezone = process.env.DEFAULT_TZ || "Asia/Jerusalem";

  // Ensure calendar connected
  try {
    await getCalendarProviderForBusiness(businessId);
  } catch (err: any) {
    if (isCalendarNotConnectedError(err)) {
      await sendAndStoreTextMessage({
        businessId,
        waId,
        body:
          lang === "en"
            ? "⚠️ Calendar is not connected yet. Ask the admin/manager to connect Google Calendar."
            : lang === "ru"
            ? "⚠️ Календарь ещё не подключён. Попросите администратора подключить Google Calendar."
            : "⚠️ עדיין לא חיברו לוח שנה למערכת. בבקשה בקשו ממנהל/ת המרפאה לחבר Google Calendar.",
        meta: { reason: "calendar-not-connected" },
      });

      await saveUserState(businessId, waId, { stage: "IDLE" });
      return;
    }
    throw err;
  }

  // 1) Deterministic weekday parsing first (fixes "שישי הבא")
  const parsedIso = tryParseNextWeekdayIso(text, timezone);

  // 2) AI fallback
  let dayIso = parsedIso;
  if (!dayIso) {
    const intent = await extractDateIntent(text);
    if (intent.needs_clarification || !intent.date) {
      await sendAndStoreTextMessage({
        businessId,
        waId,
        body: askForDateMessage(lang),
        meta: { reason: "awaiting-date" },
      });
      await saveUserState(businessId, waId, { stage: "SCHEDULING_AWAIT_DATE" });
      return;
    }
    dayIso = intent.date;
  }

  // Fetch ALL slots
  const slots = await proposeSlotsForBusiness({
    businessId,
    dayIsoDate: dayIso,
    timezone,
  });

  // Store slots + reset pagination
  await saveUserState(businessId, waId, {
    stage: "SCHEDULING_AWAIT_SLOT",
    pendingDayIso: dayIso,
    pendingSlots: slots,
    pendingSlotOffset: 0,
  });

  // Send first page (max 6)
  await sendAndStoreTextMessage({
    businessId,
    waId,
    body: slotsMessage({
      lang,
      slots,
      timezone,
      offset: 0,
      pageSize: 6,
    }),
    meta: { reason: "slots-proposed", date: dayIso, pageOffset: 0 },
  });
}
