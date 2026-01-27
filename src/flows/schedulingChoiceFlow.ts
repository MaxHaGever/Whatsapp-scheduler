import { getOrCreateUserState, saveUserState } from "../services/state";
import { sendAndStoreTextMessage } from "../services/messageService";
import { slotsMessage, bookedMessage, invalidChoiceMessage } from "../messages/scheduling.messages";
import { bookSlotForBusiness } from "../services/scheduling";
import { isMoreRequest } from "../nlp/more";
import { formatSlotLine } from "../utils/slotFormatting";
import { runSchedulingDateFlow } from "./schedulingDateFlow";

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
  const timezone = process.env.DEFAULT_TZ || "Asia/Jerusalem";

  const slots = state.pendingSlots || [];
  const offset = state.pendingSlotOffset ?? 0;
  const pageSize = 6;

  // "more" pagination
  if (isMoreRequest(text)) {
    const nextOffset = offset + pageSize;

    if (nextOffset >= slots.length) {
      await sendAndStoreTextMessage({
        businessId,
        waId,
        body:
          lang === "en"
            ? "No more slots for this day. You can write another date."
            : lang === "ru"
            ? "Больше слотов нет. Напишите другую дату."
            : "אין עוד תורים ליום הזה. אפשר לכתוב תאריך אחר.",
        meta: { reason: "no-more-slots" },
      });
      return;
    }

    await saveUserState(businessId, waId, { pendingSlotOffset: nextOffset });

    await sendAndStoreTextMessage({
      businessId,
      waId,
      body: slotsMessage({ lang, slots, timezone, offset: nextOffset, pageSize }),
      meta: { reason: "slots-more", pageOffset: nextOffset },
    });
    return;
  }

  // Number choice
  if (looksLikeNumberChoice(text)) {
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

    const label = formatSlotLine(lang, chosen.startIso, timezone);

    await sendAndStoreTextMessage({
      businessId,
      waId,
      body: bookedMessage(lang, label),
      meta: {
        reason: "booked",
        eventId: booked.eventId,
        startIso: chosen.startIso,
        endIso: chosen.endIso,
      },
    });

    // Clear state back to idle
    await saveUserState(businessId, waId, {
      stage: "IDLE",
      pendingSlots: undefined,
      pendingDayIso: undefined,
      pendingSlotOffset: undefined,
    });

    return;
  }

  // Not number / not "more" -> treat as new date request
  await saveUserState(businessId, waId, {
    stage: "SCHEDULING_AWAIT_DATE",
    pendingSlots: undefined,
    pendingDayIso: undefined,
    pendingSlotOffset: undefined,
  });

  await runSchedulingDateFlow({ businessId, waId, text });
}
