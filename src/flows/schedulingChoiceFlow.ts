import { getOrCreateUserState, saveUserState } from "../services/state";
import { sendAndStoreTextMessage } from "../services/messageService";
import { bookedMessage, invalidChoiceMessage } from "../messages/scheduling.messages";
import { bookSlotForBusiness } from "../services/scheduling";
import { createAppointmentRecord } from "../services/appointments";

function looksLikeNumberChoice(text: string) {
  return /^[1-9]\d*$/.test(text.trim());
}

export async function runSchedulingChoiceFlow(args: {
  businessId: string;
  waId: string;
  text: string;
}) {
  const { businessId, waId, text } = args;

  const state = await getOrCreateUserState(businessId, waId);
  const lang = state.preferredLanguage;
  const timezone = process.env.DEFAULT_TZ || "Asia/Jerusalem";

  const slots = state.pendingSlots || [];

  // If not a number -> user is trying to change the date/time
  if (!looksLikeNumberChoice(text)) {
    await saveUserState(businessId, waId, {
      stage: "SCHEDULING_ADJUST_DATE",
    });
    return;
  }

  const n = Number(text.trim());
  if (!Number.isFinite(n) || n < 1 || n > slots.length) {
    await sendAndStoreTextMessage({
      businessId,
      waId,
      body: invalidChoiceMessage(lang),
      meta: { reason: "invalid-slot-number" },
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

  await createAppointmentRecord({
  businessId,
  waId,
  provider: "google",
  providerEventId: booked.eventId,
  startIso: chosen.startIso,
  endIso: chosen.endIso,
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
    stage: "IDLE",
    pendingSlots: undefined,
    pendingDayIso: undefined,
  });
}
