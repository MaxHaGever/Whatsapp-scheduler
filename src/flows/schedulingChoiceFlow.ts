import { getOrCreateUserState, saveUserState } from "../services/state";
import { sendAndStoreTextMessage } from "../services/messageService";
import { invalidChoiceMessage, bookedMessage } from "../messages/scheduling.messages";
import { bookSlotForBusiness } from "../services/scheduling";

function looksLikeNumberChoice(text: string) {
  const t = text.trim();
  return /^[1-9]\d*$/.test(t);
}

export async function runSchedulingChoiceFlow(args: {
  businessId: string;
  waId: string;
  text: string;
}) {
  const { businessId, waId, text } = args;

  const state = await getOrCreateUserState(businessId, waId);
  const lang = state.preferredLanguage;

  // Future: take from Business timezone
  const timezone = process.env.DEFAULT_TZ || "Asia/Jerusalem";

  const slots = state.pendingSlots || [];

  // If user didn't send a number, route them back to date stage
  if (!looksLikeNumberChoice(text)) {
    await saveUserState(businessId, waId, {
      stage: "SCHEDULING_AWAIT_DATE",
      pendingSlots: undefined,
      pendingDayIso: undefined,
    });

    await sendAndStoreTextMessage({
      businessId,
      waId,
      body:
        lang === "en"
          ? "Okay — write another date/day."
          : lang === "ru"
          ? "Хорошо — напишите другую дату/день."
          : "בסדר — כתבו תאריך/יום אחר.",
      meta: { reason: "slot-choice-not-number", text },
    });

    return;
  }

  const n = Number(text.trim());
  if (!Number.isFinite(n) || n < 1 || n > slots.length) {
    await sendAndStoreTextMessage({
      businessId,
      waId,
      body: invalidChoiceMessage(lang),
      meta: { reason: "invalid-slot-number", text },
    });
    return;
  }

  const chosen = slots[n - 1];

  const booked = await bookSlotForBusiness({
    businessId,
    waId,
    startIso: chosen.startIso,
    endIso: chosen.endIso,
    timezone,
    summary: "Clinic Appointment",
  });

  await sendAndStoreTextMessage({
    businessId,
    waId,
    body: bookedMessage(lang, chosen.label),
    meta: {
      reason: "booked",
      eventId: booked.eventId,
      startIso: chosen.startIso,
      endIso: chosen.endIso,
      label: chosen.label,
    },
  });

  await saveUserState(businessId, waId, {
    stage: "AWAIT_INTENT",
    pendingSlots: undefined,
    pendingDayIso: undefined,
  });
}
