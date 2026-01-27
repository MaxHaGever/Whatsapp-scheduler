import { getOrCreateUserState, saveUserState } from "../services/state";
import { sendAndStoreTextMessage } from "../services/messageService";
import { askForDateMessage, slotsMessage } from "../messages/scheduling.messages";
import { extractDateIntent } from "../ai/date/intentExtractor";
import { proposeSlotsForBusiness } from "../services/scheduling";
import { getCalendarProviderForBusiness } from "../calendar/calendarService";

function isCalendarNotConnectedError(err: any): boolean {
  const msg = String(err?.message ?? "");
  return (
    msg.includes("No active calendar connection") ||
    msg.includes("refresh token missing") ||
    msg.includes("not connected") ||
    msg.includes("Google refresh token missing")
  );
}

export async function runSchedulingProposeFlow(args: {
  businessId: string;
  waId: string;
  text: string;
}) {
  const { businessId, waId, text } = args;

  const state = await getOrCreateUserState(businessId, waId);
  const lang = state.preferredLanguage;

  const timezone = process.env.DEFAULT_TZ || "Asia/Jerusalem";
  const PAGE_SIZE = 6;

  // ✅ Ensure calendar connected
  try {
    await getCalendarProviderForBusiness(businessId);
  } catch (err: any) {
    if (isCalendarNotConnectedError(err)) {
      await sendAndStoreTextMessage({
        businessId,
        waId,
        body:
          lang === "en"
            ? "⚠️ Calendar is not connected yet. Please ask the business owner to connect Google Calendar."
            : lang === "ru"
            ? "⚠️ Календарь ещё не подключён. Попросите владельца подключить Google Calendar."
            : "⚠️ עדיין לא חיברו לוח שנה למערכת. בבקשה בקשו מבעל/ת העסק לחבר Google Calendar.",
        meta: { reason: "calendar-not-connected" },
      });

      await saveUserState(businessId, waId, { stage: "IDLE" });
      return;
    }
    throw err;
  }

  // ✅ Extract date (AI)
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

  // ✅ Fetch ALL slots for that day
  const slots = await proposeSlotsForBusiness({
    businessId,
    dayIsoDate: intent.date,
    timezone,
  });

  await saveUserState(businessId, waId, {
    stage: "SCHEDULING_AWAIT_SLOT",
    pendingDayIso: intent.date,
    pendingSlots: slots,
    pendingSlotOffset: 0,
  });

  // ✅ IMPORTANT: slotsMessage now expects ONE object argument (fixes TS2554)
  await sendAndStoreTextMessage({
    businessId,
    waId,
    body: slotsMessage({
      lang,
      slots,
      timezone,
      offset: 0,
      pageSize: PAGE_SIZE,
    }),
    meta: { reason: "slots-proposed", date: intent.date, offset: 0 },
  });
}
