import type { Request, Response } from "express";

import { runSchedulingFlow } from "../flows/schedulingFlow";

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

export async function handleWebhookPost(req: Request, res: Response) {
  // ✅ ACK immediately (Meta requires fast response)
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

    // ✅ Expired session -> reset state
    if (isExpired(state)) {
      await resetConversationState(waId);
      state = await getOrCreateUserState(waId);
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
        meta: { stage: "WELCOME", reason: "language-pick", lang: langPick },
      });

      await saveUserState(waId, { stage: "IDLE" });
      return;
    }

    // ✅ WELCOME stage (first contact)
    if (state.stage === "WELCOME") {
      await sendAndStoreTextMessage({
        businessId,
        waId,
        body: welcomeMessage(state.preferredLanguage),
        meta: { stage: "WELCOME", reason: "first-contact" },
      });

      await saveUserState(waId, { stage: "IDLE" });
      return;
    }

    // ✅ Scheduling flow handles: IDLE / AWAIT_DATE / OFFERING_SLOTS
    const handled = await runSchedulingFlow({
      businessId,
      waId,
      textRaw,
    });

    // ✅ If not handled -> simple fallback (stored? NOT for now)
    if (!handled) {
      await sendAndStoreTextMessage({
        businessId,
        waId,
        body: '✅ קיבלתי!\nכרגע אני יודע לעזור רק עם קביעת תורים.\nנסו לכתוב למשל: "מחר בבוקר"',
        meta: { stage: state.stage, reason: "not-handled" },
      });

      // keep IDLE so user can start scheduling later
      await saveUserState(waId, { stage: "IDLE" });
    }

    return;
  } catch (err) {
    console.error("[WEBHOOK_ERROR]", err);
  }
}
