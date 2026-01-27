import { getOrCreateUserState, saveUserState } from "../services/state";
import { sendAndStoreTextMessage } from "../services/messageService";
import { extractTopIntent } from "../ai/intent/extractTopIntent";

export async function runIntentDetectionFlow(args: {
  businessId: string;
  waId: string;
  text: string;
}) {
  const { businessId, waId, text } = args;

  const state = await getOrCreateUserState(businessId, waId);
  const lang = state.preferredLanguage;

  const intent = await extractTopIntent(text);

  if (intent.intent === "schedule") {
    await saveUserState(businessId, waId, { stage: "SCHEDULING_AWAIT_DATE" });

    await sendAndStoreTextMessage({
      businessId,
      waId,
      body:
        lang === "en"
          ? "Sure — tell me what day/date you want (e.g. tomorrow morning / next Friday)."
          : lang === "ru"
          ? "Хорошо — напишите день/дату (например: завтра утром / в следующую пятницу)."
          : 'מעולה — כתבו יום/תאריך (למשל: "מחר בבוקר" / "בשישי הבא").',
      meta: { reason: "intent-schedule" },
    });
    return;
  }

  if (intent.intent === "cancel") {
    await saveUserState(businessId, waId, { stage: "CANCEL_AWAIT_TARGET" });

    await sendAndStoreTextMessage({
      businessId,
      waId,
      body:
        lang === "en"
          ? "Ok — which appointment should I cancel? (You can say: “my next appointment”, or a date/time.)"
          : lang === "ru"
          ? "Ок — какой приём отменить? (Например: “следующий”, или дата/время.)"
          : 'אוקיי — איזה תור לבטל? (אפשר לכתוב: "התור הבא" או תאריך/שעה.)',
      meta: { reason: "intent-cancel" },
    });
    return;
  }

  if (intent.intent === "reschedule") {
    await saveUserState(businessId, waId, { stage: "RESCHEDULE_AWAIT_TARGET" });

    await sendAndStoreTextMessage({
      businessId,
      waId,
      body:
        lang === "en"
          ? "Ok — which appointment do you want to move? (Say: “my next appointment” or a date/time.)"
          : lang === "ru"
          ? "Ок — какой приём перенести? (Например: “следующий”, или дата/время.)"
          : 'אוקיי — איזה תור לשנות? (אפשר: "התור הבא" או תאריך/שעה.)',
      meta: { reason: "intent-reschedule" },
    });
    return;
  }

  // unknown → ask again (stay in AWAIT_INTENT)
  await saveUserState(businessId, waId, { stage: "AWAIT_INTENT" });

  await sendAndStoreTextMessage({
    businessId,
    waId,
    body:
      lang === "en"
        ? "I can help you schedule, cancel, or reschedule an appointment. What would you like to do?"
        : lang === "ru"
        ? "Я могу записать, отменить или перенести приём. Что вы хотите сделать?"
        : "אני יכול לעזור לקבוע / לבטל / לשנות תור. מה תרצו לעשות?",
    meta: { reason: "intent-unknown" },
  });
}
