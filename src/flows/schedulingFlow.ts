import { getOrCreateUserState, saveUserState } from "../services/state";
import { sendAndStoreTextMessage } from "../services/messageService";
import { calendarNotConnectedMessage } from "../messages/calendar.messages";
import {
  askForDateMessage,
  slotsMessage,
  bookedMessage,
  invalidChoiceMessage,
} from "../messages/scheduling.messages";

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

function looksLikeNumberChoice(text: string) {
  const t = text.trim();
  return /^[1-9]\d*$/.test(t);
}

export async function runSchedulingFlow(args: {
  businessId: string;
  waId: string;
  text: string;
}) {
  const { businessId, waId, text } = args;

  const state = await getOrCreateUserState(waId);
  const lang = state.preferredLanguage;
  const timezone = process.env.DEFAULT_TZ || "Asia/Jerusalem";

  // ✅ Ensure calendar is connected
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

      await saveUserState(waId, { stage: "IDLE" });
      return;
    }

    throw err;
  }

  // ✅ AWAIT_SLOT_CHOICE:
  // accept:
  // 1/2/3 -> book placeholder
  // or any other text -> treat as new date request (go back to AI)
  if (state.stage === "AWAIT_SLOT_CHOICE") {
    const slots = state.pendingSlots || [];

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

      // ✅ for now: pretend booked
      await sendAndStoreTextMessage({
        businessId,
        waId,
        body: bookedMessage(lang, chosen.label),
        meta: { reason: "booked-placeholder" },
      });

      await saveUserState(waId, {
        stage: "IDLE",
        pendingSlots: undefined,
        pendingDayIso: undefined,
      });

      return;
    }

    // ✅ Not a number → user wants another date / later / earlier / etc
    await saveUserState(waId, {
      stage: "AWAIT_DATE",
      pendingSlots: undefined,
      pendingDayIso: undefined,
    });
  }

  // ✅ AWAIT_DATE: AI active here
  await saveUserState(waId, { stage: "AWAIT_DATE" });

  const intent = await extractDateIntent(text);

  if (intent.needs_clarification || !intent.date) {
    await sendAndStoreTextMessage({
      businessId,
      waId,
      body: askForDateMessage(lang),
      meta: { reason: "awaiting-date" },
    });

    await saveUserState(waId, { stage: "AWAIT_DATE" });
    return;
  }

  const slots = await proposeSlotsForBusiness({
    businessId,
    dayIsoDate: intent.date,
    timezone,
    maxSlots: 3,
  });

  await sendAndStoreTextMessage({
    businessId,
    waId,
    body: slotsMessage(lang, slots),
    meta: { reason: "slots-proposed", date: intent.date },
  });

  await saveUserState(waId, {
    stage: "AWAIT_SLOT_CHOICE",
    pendingDayIso: intent.date,
    pendingSlots: slots,
  });
}
