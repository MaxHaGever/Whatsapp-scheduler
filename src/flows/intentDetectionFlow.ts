import { saveUserState } from "../services/state";
import { extractActionIntent } from "../ai/intent/extractActionIntent";

export async function runIntentDetectionFlow(args: {
  businessId: string;
  waId: string;
  text: string;
}) {
  const { businessId, waId, text } = args;

  const { intent, confidence } = await extractActionIntent(text);

  // optional safety threshold
  const THRESH = Number(process.env.INTENT_CONFIDENCE_THRESHOLD ?? 0.6);

  if (confidence < THRESH || intent === "unknown") {
    await saveUserState(businessId, waId, { stage: "IDLE" });
    return;
  }

  if (intent === "schedule") {
    await saveUserState(businessId, waId, { stage: "SCHEDULING_AWAIT_DATE" });
    return;
  }

  if (intent === "cancel") {
    await saveUserState(businessId, waId, { stage: "CANCEL_AWAIT_TARGET" });
    return;
  }

  if (intent === "reschedule") {
    await saveUserState(businessId, waId, { stage: "RESCHEDULE_AWAIT_TARGET" });
    return;
  }

  await saveUserState(businessId, waId, { stage: "IDLE" });
}
