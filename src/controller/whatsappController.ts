import { Request, Response } from "express";
import { ensureDefaultCalendarConnection } from "../calendar/ensureDefaultCalendarConnection";
import { sendTextMessage } from "../services/whatsapp";
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
  res.sendStatus(200);

  try {
    const businessId = await getDefaultBusinessId();
    await ensureDefaultCalendarConnection(businessId);

    const body = req.body;
    const change = body?.entry?.[0]?.changes?.[0];
    const value = change?.value;

    if (value?.statuses?.length) {
      const s = value.statuses[0];
      console.log(`[WA STATUS] id=${s?.id} status=${s?.status}`);

      if (s?.id && s?.status) {
        await updateMessageStatusByWaMessageId(s.id, s.status);
      }
      return;
    }

    const message = value?.messages?.[0];
    if (!message) return;

    const waId: string | undefined = message.from;
    const type: string | undefined = message.type;
    if (!waId) return;

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

    // Load state
    let state = await getOrCreateUserState(waId);

    // Expire session → reset
    if (isExpired(state)) {
      await resetConversationState(waId);
      state = await getOrCreateUserState(waId);
      await saveUserState(waId, { stage: "WELCOME" });
    }

    // Manual reset
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

    // Language selection
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

    // WELCOME stage
    if (state.stage === "WELCOME") {
      await sendAndStoreTextMessage({
        businessId,
        waId,
        body: welcomeMessage(state.preferredLanguage),
        meta: { stage: "WELCOME" },
      });

      await saveUserState(waId, { stage: "IDLE" });
      return;
    }

    // ✅ For now: everything else → simple placeholder reply (not stored yet)
    await sendTextMessage(
      waId,
      "✅ תודה! בשלב הזה אני יודע רק לברך 🙂\nבקרוב נוסיף קביעת תורים.\nאם רוצים להתחיל מחדש כתבו: reset"
    );

    return;
  } catch (err) {
    console.error("[WEBHOOK_ERROR]", err);
  }
}
