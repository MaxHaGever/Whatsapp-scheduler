import { getOrCreateUserState, saveUserState } from "../services/state";
import { sendAndStoreTextMessage } from "../services/messageService";
import { looksLikeSchedulingRequest } from "../nlp/dateHints";
import { extractActionIntent } from "../ai/intent/extractActionIntent";

export async function runIntentDetectionFlow(args: {
  businessId: string;
  waId: string;
  text: string;
}) {
  const { businessId, waId, text } = args;

  // ✅ 1) Fast heuristic: if it looks like a date/time request -> scheduling
  // Fixes cases like "מחר בבוקר" that don't explicitly say "appointment"
  if (looksLikeSchedulingRequest(text)) {
    await saveUserState(businessId, waId, { stage: "SCHEDULING_AWAIT_DATE" });
    return;
  }

  // ✅ 2) Otherwise: use AI classification
  const state = await getOrCreateUserState(businessId, waId);
  const lang = state.preferredLanguage;

  const intent = await extractActionIntent(text);

  if (intent.intent === "schedule") {
    await saveUserState(businessId, waId, { stage: "SCHEDULING_AWAIT_DATE" });
    return;
  }

  if (intent.intent === "cancel") {
    await saveUserState(businessId, waId, { stage: "CANCEL_AWAIT_TARGET" });
    return;
  }

  if (intent.intent === "reschedule") {
    await saveUserState(businessId, waId, { stage: "RESCHEDULE_AWAIT_TARGET" });
    return;
  }

  // Unknown -> stay IDLE (controller will show idle help)
  await saveUserState(businessId, waId, { stage: "IDLE" });

  // Optional: send a one-time hint when confidence is low
  if (intent.intent === "unknown" && intent.confidence < 0.5) {
    await sendAndStoreTextMessage({
      businessId,
      waId,
      body:
        lang === "en"
          ? "I can help you book, cancel, or reschedule. What would you like to do?"
          : lang === "ru"
          ? "Я могу записать, отменить или перенести. Что вы хотите сделать?"
          : "אני יכול לעזור לקבוע תור, לבטל תור, או לשנות תור. מה תרצו לעשות?",
      meta: { reason: "intent-unknown", confidence: intent.confidence },
    });
  }
}
