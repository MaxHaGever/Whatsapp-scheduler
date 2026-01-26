import { sendAndStoreTextMessage } from "../services/messageService";
import { welcomeMessage } from "../messages/welcome.messages";
import type { Lang } from "../services/state";

export async function runWelcomeFlow(args: {
  businessId: string;
  waId: string;
  lang: Lang;
  reason?: string;
}) {
  const { businessId, waId, lang, reason } = args;

  await sendAndStoreTextMessage({
    businessId,
    waId,
    body: welcomeMessage(lang),
    meta: {
      stage: "WELCOME",
      reason: reason ?? "welcome-flow",
      lang,
    },
  });
}
