import { getOrCreateUserState, saveUserState } from "../services/state";
import { sendAndStoreTextMessage } from "../services/messageService";
import { askForDateMessage, slotsMessage } from "../messages/scheduling.messages";
import { extractDateIntent } from "../ai/date/extractDateIntent";
import { proposeSlotsForBusiness } from "../services/scheduling";
import { getCalendarProviderForBusiness } from "../calendar/calendarService";
import { calendarNotConnectedMessage } from "../messages/calendar.messages";

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

  // ensure calendar connected
  try {
    await getCalendarProviderForBusiness(businessId);
  } catch (err: any) {
    if (isCalendarNotConnectedError(err)) {
      await sendAndStoreTextMessage({
        businessId,
        waId,
        body: calendarNotConnectedMessage(lang),
        meta: { reason: "calendar-not-connected" },
      });
      await saveUserState(businessId, waId, { stage: "IDLE" });
      return;
    }
    throw err;
  }

  // AI date extraction
  const intent = await extractDateIntent(text);

  if (intent.needs_clarification || !intent.date) {
    await sendAndStoreTextMessage({
      businessId,
      waId,
      body: askForDateMessage(lang),
      meta: { reason: "awaiting-date" },
    });
    // keep them in date collection mode (either initial or adjust stage is OK)
    await saveUserState(businessId, waId, { stage: "SCHEDULING_AWAIT_DATE" });
    return;
  }

  // IMPORTANT: do not cap maxSlots -> show ALL for the day
  const slots = await proposeSlotsForBusiness({
    businessId,
    dayIsoDate: intent.date,
    timezone,
    // maxSlots omitted
  });

  await sendAndStoreTextMessage({
    businessId,
    waId,
    body: slotsMessage(lang, slots),
    meta: { reason: "slots-proposed", date: intent.date },
  });

  await saveUserState(businessId, waId, {
    stage: "SCHEDULING_AWAIT_SLOT",
    pendingDayIso: intent.date,
    pendingSlots: slots,
  });
}
