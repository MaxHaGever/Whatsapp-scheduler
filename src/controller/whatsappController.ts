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

import { detectLanguageByKeyword, isResetRequest } from "../nlp/commands";

import { runWelcomeFlow } from "../flows/welcomeFlow";
import { runIdleFlow } from "../flows/idleFlow";
import { runSchedulingFlow } from "../flows/schedulingFlow";

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

    // ✅ Non-text message -> respond (stored)
    if (type !== "text") {
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

    // ✅ Always store inbound message
    await saveInboundMessage({
      businessId,
      waId,
      body: textRaw,
      waMessageId: message.id ?? null,
      meta: { source: "webhook" },
    });

    // ✅ Load state
    let state = await getOrCreateUserState(waId);

    // ✅ Session expired -> reset
    if (isExpired(state)) {
      await resetConversationState(waId);
      state = await getOrCreateUserState(waId);
    }

    // ✅ Manual reset
    if (isResetRequest(textRaw)) {
      await resetConversationState(waId);
      state = await getOrCreateUserState(waId);

      await runWelcomeFlow({
        businessId,
        waId,
        lang: state.preferredLanguage,
        reason: "manual-reset",
      });

      await saveUserState(waId, { stage: "IDLE" });
      return;
    }

    // ✅ Language selection
    const langPick = detectLanguageByKeyword(textRaw);
    if (langPick) {
      await saveUserState(waId, { preferredLanguage: langPick });

      await runWelcomeFlow({
        businessId,
        waId,
        lang: langPick,
        reason: "language-picked",
      });

      await saveUserState(waId, { stage: "IDLE" });
      return;
    }

    // ✅ First time welcome
    if (state.stage === "WELCOME") {
      await runWelcomeFlow({
        businessId,
        waId,
        lang: state.preferredLanguage,
        reason: "first-welcome",
      });

      await saveUserState(waId, { stage: "IDLE" });
      return;
    }

    // ✅ Main routing:
    // If user is mid scheduling OR they are idle and message looks relevant → run scheduling
    if (state.stage === "AWAIT_DATE" || state.stage === "AWAIT_SLOT_CHOICE") {
      await runSchedulingFlow({ businessId, waId, text: textRaw });
      return;
    }

    // ✅ Otherwise idle handler decides whether to start scheduling or just explain
    await runIdleFlow({ businessId, waId, text: textRaw });
    return;
  } catch (err) {
    console.error("[WEBHOOK_ERROR]", err);
  }
}
