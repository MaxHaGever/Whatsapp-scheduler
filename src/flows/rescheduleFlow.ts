import { getOrCreateUserState, saveUserState } from "../services/state";
import { sendAndStoreTextMessage } from "../services/messageService";

/**
 * Reschedule flow placeholder.
 * Stages involved:
 * - RESCHEDULE_AWAIT_TARGET: user needs to choose which appointment to move
 * - RESCHEDULE_AWAIT_NEW_DATE: user needs to provide a new date
 *
 * We'll implement the actual logic after scheduling + cancel are stable.
 */
export async function runRescheduleFlow(args: {
  businessId: string;
  waId: string;
  text: string;
}) {
  const { businessId, waId, text } = args;

  const state = await getOrCreateUserState(businessId, waId);
  const lang = state.preferredLanguage;

  if (state.stage === "RESCHEDULE_AWAIT_TARGET") {
    // TODO: list upcoming appts and let user pick "next" or a number
    await sendAndStoreTextMessage({
      businessId,
      waId,
      body:
        lang === "en"
          ? 'Reschedule is not implemented yet. For now you can type "cancel" to cancel an appointment.'
          : lang === "ru"
          ? 'Перенос пока не реализован. Пока можно написать "cancel" чтобы отменить.'
          : 'שינוי תור עדיין לא מוכן 🙏\nבינתיים אפשר לכתוב "לבטל תור" כדי לבטל.',
      meta: { reason: "reschedule-not-implemented", text },
    });

    await saveUserState(businessId, waId, { stage: "AWAIT_INTENT" });
    return;
  }

  if (state.stage === "RESCHEDULE_AWAIT_NEW_DATE") {
    await sendAndStoreTextMessage({
      businessId,
      waId,
      body:
        lang === "en"
          ? "Reschedule is not implemented yet."
          : lang === "ru"
          ? "Перенос пока не реализован."
          : "שינוי תור עדיין לא מוכן.",
      meta: { reason: "reschedule-not-implemented", text },
    });

    await saveUserState(businessId, waId, { stage: "AWAIT_INTENT" });
    return;
  }

  // If somehow called from another stage, reset routing safely.
  await saveUserState(businessId, waId, { stage: "AWAIT_INTENT" });
}
