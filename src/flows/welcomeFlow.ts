import { saveUserState } from "../services/state";
import { sendAndStoreTextMessage } from "../services/messageService";
import { welcomeMessage } from "../messages/welcome.messages";

export async function runWelcomeFlow(args: {
  businessId: string;
  waId: string;
  lang: "he" | "ru" | "en";
}) {
  await sendAndStoreTextMessage({
    businessId: args.businessId,
    waId: args.waId,
    body: welcomeMessage(args.lang),
    meta: { flow: "welcome" },
  });

  await saveUserState(args.waId, { stage: "IDLE" });
}
