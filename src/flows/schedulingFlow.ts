import { extractDateIntent } from "../ai/extractDateIntent";
import { sendAndStoreTextMessage } from "../services/messageService";
import { getOrCreateUserState, saveUserState, type Lang } from "../services/state";
import { proposeSlotsForBusiness, bookSlotForBusiness } from "../services/scheduling";

import { askDateMessage } from "../messages/askDate.messages";
import { slotsMessage } from "../messages/slots.messages";
import { bookedMessage } from "../messages/booked.messages";
import { noSlotsMessage } from "../messages/noSlots.messages";

import { looksLikeSchedulingRequest, parseChoiceNumber } from "../nlp/dateHints";

const TZ = process.env.DEFAULT_TZ || "Asia/Jerusalem";

export async function runSchedulingFlow(args: {
  businessId: string;
  waId: string;
  textRaw: string;
}): Promise<boolean> {
  const state = await getOrCreateUserState(args.waId);
  const lang: Lang = state.preferredLanguage;

  // ✅ IDLE: decide if this looks like scheduling
  if (state.stage === "IDLE") {
    if (!looksLikeSchedulingRequest(args.textRaw)) {
      return false; // not handled here -> controller can fallback placeholder
    }

    // start scheduling using the same message
    await saveUserState(args.waId, { stage: "AWAIT_DATE" });
    return await runSchedulingFlow({ ...args }); // re-run inside AWAIT_DATE
  }

  // ✅ AWAIT_DATE: AI ACTIVE
  if (state.stage === "AWAIT_DATE") {
    const intent = await extractDateIntent(args.textRaw);

    // update lang if AI detected confidently
    if (intent.language === "he" || intent.language === "ru" || intent.language === "en") {
      await saveUserState(args.waId, { preferredLanguage: intent.language });
    }

    const useLang: Lang =
      intent.language === "he" || intent.language === "ru" || intent.language === "en"
        ? intent.language
        : lang;

    // no date -> ask again (AI stays active here)
    if (!intent.date || intent.needs_clarification) {
      await sendAndStoreTextMessage({
        businessId: args.businessId,
        waId: args.waId,
        body: askDateMessage(useLang),
        meta: { flow: "scheduling", stage: "AWAIT_DATE", reason: "needs_clarification" },
      });

      await saveUserState(args.waId, { stage: "AWAIT_DATE" });
      return true;
    }

    // propose slots
    const slots = await proposeSlotsForBusiness({
      businessId: args.businessId,
      dayIsoDate: intent.date,
      timezone: TZ,
      maxSlots: 3,
    });

    if (!slots.length) {
      await sendAndStoreTextMessage({
        businessId: args.businessId,
        waId: args.waId,
        body: noSlotsMessage(useLang),
        meta: { flow: "scheduling", stage: "AWAIT_DATE", date: intent.date },
      });

      await saveUserState(args.waId, { stage: "AWAIT_DATE" });
      return true;
    }

    await sendAndStoreTextMessage({
      businessId: args.businessId,
      waId: args.waId,
      body: slotsMessage(useLang, slots),
      meta: { flow: "scheduling", stage: "OFFERING_SLOTS", date: intent.date },
    });

    await saveUserState(args.waId, {
      stage: "OFFERING_SLOTS",
      pendingDayIso: intent.date,
      pendingSlots: slots,
      pendingTimePreference: intent.time_preference ?? null,
      preferredLanguage: useLang,
    });

    return true;
  }

  // ✅ OFFERING_SLOTS: flexible (number OR new request)
  if (state.stage === "OFFERING_SLOTS") {
    const choice = parseChoiceNumber(args.textRaw);
    const slots = state.pendingSlots ?? [];

    // 1) If user typed 1/2/3 -> book
    if (choice !== null && choice >= 1 && choice <= slots.length) {
      const picked = slots[choice - 1];

      await bookSlotForBusiness({
        businessId: args.businessId,
        waId: args.waId,
        startIso: picked.startIso,
        endIso: picked.endIso,
        summary: "Clinic Appointment",
      });

      await sendAndStoreTextMessage({
        businessId: args.businessId,
        waId: args.waId,
        body: bookedMessage(lang, picked.label),
        meta: { flow: "scheduling", stage: "BOOKED", picked: picked.label },
      });

      // return to idle
      await saveUserState(args.waId, {
        stage: "IDLE",
        pendingDayIso: undefined,
        pendingSlots: undefined,
        pendingTimePreference: null,
      });

      return true;
    }

    // 2) Otherwise -> treat message as a NEW scheduling request
    // AI ACTIVE here because user might say "later", "Thursday", "evening"
    const intent = await extractDateIntent(args.textRaw);

    // language update
    if (intent.language === "he" || intent.language === "ru" || intent.language === "en") {
      await saveUserState(args.waId, { preferredLanguage: intent.language });
    }

    const useLang: Lang =
      intent.language === "he" || intent.language === "ru" || intent.language === "en"
        ? intent.language
        : lang;

    // If AI didn't get a date but we have pendingDayIso, and user maybe said "evening/later"
    const day = intent.date ?? state.pendingDayIso ?? null;

    if (!day) {
      await sendAndStoreTextMessage({
        businessId: args.businessId,
        waId: args.waId,
        body: askDateMessage(useLang),
        meta: { flow: "scheduling", stage: "OFFERING_SLOTS", reason: "no-date" },
      });
      await saveUserState(args.waId, { stage: "AWAIT_DATE" });
      return true;
    }

    const newSlots = await proposeSlotsForBusiness({
      businessId: args.businessId,
      dayIsoDate: day,
      timezone: TZ,
      maxSlots: 3,
    });

    await sendAndStoreTextMessage({
      businessId: args.businessId,
      waId: args.waId,
      body: slotsMessage(useLang, newSlots),
      meta: { flow: "scheduling", stage: "OFFERING_SLOTS", date: day, reason: "refine-or-new-date" },
    });

    await saveUserState(args.waId, {
      stage: "OFFERING_SLOTS",
      pendingDayIso: day,
      pendingSlots: newSlots,
      pendingTimePreference: intent.time_preference ?? null,
      preferredLanguage: useLang,
    });

    return true;
  }

  return false;
}
