import { sendAndStoreTextMessage } from "../services/messageService";
import { getOrCreateUserState } from "../services/state";

export async function runIdleFlow(args: {
  businessId: string;
  waId: string;
  text: string;
}) {
  const { businessId, waId } = args;

  const state = await getOrCreateUserState(businessId, waId);
  const lang = state.preferredLanguage;

  const msg =
    lang === "en"
      ? "I can help you: book an appointment, cancel, or reschedule. What would you like to do?"
      : lang === "ru"
      ? "Я могу: записать, отменить или перенести встречу. Что вы хотите сделать?"
      : "אני יכול לעזור לקבוע תור / לבטל תור / לשנות תור. מה תרצו לעשות?";

  await sendAndStoreTextMessage({
    businessId,
    waId,
    body: msg,
    meta: { reason: "idle-help" },
  });
}
