import { Request, Response } from "express";

import {
  getOrCreateUserState,
  saveUserState,
  resetConversationState,
  isExpired,
} from "../services/state";

import {
  getDefaultBusinessId,
  saveInboundMessage,
  sendAndStoreTextMessage,
  updateMessageStatusByWaMessageId,
} from "../services/messageService";

import { welcomeMessage } from "../messages/welcome.messages";
import { detectLanguageByKeyword, isResetRequest } from "../nlp/commands";

import { runWelcomeFlow } from "../flows/welcomeFlow";
import { runIdleFlow } from "../flows/idleFlow";

export async function handleWebhookPost(req: Request, res: Response) {
  // ✅ ACK immediately (Meta requires quick response)
  res.sendStatus(200);

  try {
    const businessId = await getDefaultBusinessId();

    const body = req.body;
    const change = body?.entry?.[0]?.changes?.[0];
    const value = change?.value;

    // ✅ Status updates (delivered/read/etc)
    if (value?.statuses?.length) {
      const s = value.statuses[0];
      console.log(`[WA STATUS] id=${s?.id} status=${s?.status}`);

      if (s?.id && s?.status) {
        await updateMessageStatusByWaMessageId(s.id, s.status);
      }
      return;
    }

    // ✅ Only handle inbound messages
    const message = value?.messages?.[0];
    if (!message) return;

    const waId: string | undefined = message.from;
    const type: string | undefined = message.type;
    if (!waId) return;

    // ✅ Non-text message -> respond with a fixed message (stored)
    if (type !== "text") {
      console.log(`[INBOUND] from=${waId} type=${type} ignored`);

      await sendAndStoreTextMessage({
        businessId,
        waId,
        body: "אני יכול לעבד רק הודעות טקסט כרגע 🙂",
        meta: { reason: "non-text", inboundType: type },
      });

      return;
    }

    // ✅ Extract text
    const textRaw: string | undefined = message?.text?.body;
    if (!textRaw) return;

    console.log(`[INBOUND] from=${waId} text="${textRaw}"`);

    // ✅ Always store inbound text message
    await saveInboundMessage({
      businessId,
      waId,
      body: textRaw,
      waMessageId: message.id ?? null,
      meta: { source: "webhook" },
    });

    // ✅ Load user state
    let state = await getOrCreateUserState(waId);

    // ✅ Session expired -> reset conversation stage back to welcome
    if (isExpired(state)) {
      await resetConversationState(waId);
      state = await getOrCreateUserState(waId);
      await saveUserState(waId, { stage: "WELCOME" });
    }

    // ✅ Manual reset command
    if (isResetRequest(textRaw)) {
      await resetConversationState(waId);
      state = await getOrCreateUserState(waId);

      await sendAndStoreTextMessage({
        businessId,
        waId,
        body: welcomeMessage(state.preferredLanguage),
        meta: { stage: "WELCOME", reason: "manual-reset" },
      });

      await saveUserState(waId, { stage: "IDLE" });
      return;
    }

    // ✅ Language selection command
    const langPick = detectLanguageByKeyword(textRaw);
    if (langPick) {
      await saveUserState(waId, { preferredLanguage: langPick });

      await sendAndStoreTextMessage({
        businessId,
        waId,
        body: welcomeMessage(langPick),
        meta: { stage: "WELCOME", lang: langPick },
      });

      await saveUserState(waId, { stage: "IDLE" });
      return;
    }

    // ✅ Route by state
    if (state.stage === "WELCOME") {
      await runWelcomeFlow({
        businessId,
        waId,
        lang: state.preferredLanguage,
      });
      return;
    }

    // ✅ For now: everything else -> placeholder reply (NOT stored)
    await runIdleFlow({ waId });
    return;
  } catch (err) {
    console.error("[WEBHOOK_ERROR]", err);
  }
}
