import { Request, Response } from "express";
import { BusinessModel } from "../models/Business";

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
  /**
   * WhatsApp Cloud API webhook payload shape (simplified):
   * {
   *   object: "whatsapp_business_account",
   *   entry: [
   *     {
   *       id: "<WABA_ID>",
   *       changes: [
   *         {
   *           field: "messages",
   *           value: {
   *             metadata: {
   *               phone_number_id: "<BUSINESS_PHONE_NUMBER_ID>",
   *               display_phone_number: "<BUSINESS_NUMBER>"
   *             },
   *             messages: [
   *               { from: "<USER_WA_ID>", id: "<wamid...>", type: "text", text: { body: "hi" } }
   *             ],
   *             statuses: [
   *               { id: "<wamid...>", status: "delivered" }
   *             ]
   *           }
   *         }
   *       ]
   *     }
   *   ]
   * }
   */

  // ✅ ACK immediately (Meta requires quick response)
  res.sendStatus(200);

  try {
    const body = req.body;

    // ✅ Robust: Meta can send multiple entries/changes/messages in one POST
    for (const entry of body?.entry ?? []) {
      for (const change of entry?.changes ?? []) {
        const value = change?.value;
        if (!value) continue;

        // ✅ Which business number received this event
        const phoneNumberId: string | undefined = value?.metadata?.phone_number_id;
        if (!phoneNumberId) continue;

        // ✅ Resolve Business from phone_number_id (fallback to default for dev/testing)
        const businessDoc = await BusinessModel.findOne({ phoneNumberId }).lean();

        let businessId: string;

        if (businessDoc) {
          businessId = String((businessDoc as any)._id);
        } else {
        // ✅ Production safety: don't route unknown numbers to default
        if (process.env.NODE_ENV === "production") {
        console.warn(`[WEBHOOK] Unknown phoneNumberId=${phoneNumberId} - ignoring`);
       continue; // continues the "for (const change ...)" loop
  }

        // ✅ Dev fallback
          businessId = await getDefaultBusinessId();
        }

        // ✅ Status updates (delivered/read/etc)
        if (value?.statuses?.length) {
          const s = value.statuses[0];
          console.log(`[WA STATUS] phoneNumberId=${phoneNumberId} id=${s?.id} status=${s?.status}`);

          if (s?.id && s?.status) {
            // NOTE: requires messageService signature: (businessId, waMessageId, status)
            await updateMessageStatusByWaMessageId(businessId, s.id, s.status);
          }
          continue;
        }

        // ✅ Inbound messages (can be more than one)
        const messages = value?.messages ?? [];
        for (const message of messages) {
          if (!message) continue;

          const waId: string | undefined = message.from;
          const type: string | undefined = message.type;
          if (!waId) continue;

          // ✅ Non-text message -> respond (stored)
          if (type !== "text") {
            await sendAndStoreTextMessage({
              businessId,
              waId,
              body: "אני יכול לעבד רק הודעות טקסט כרגע 🙂",
              meta: { reason: "non-text", inboundType: type, phoneNumberId },
            });
            continue;
          }

          // ✅ Extract text
          const textRaw: string | undefined = message?.text?.body;
          if (!textRaw) continue;

          console.log(`[INBOUND] phoneNumberId=${phoneNumberId} from=${waId} text="${textRaw}"`);

          // ✅ Always store inbound message
          await saveInboundMessage({
            businessId,
            waId,
            body: textRaw,
            waMessageId: message.id ?? null,
            meta: { source: "webhook", phoneNumberId },
          });

          // ✅ Load state (scoped by businessId + waId)
          let state = await getOrCreateUserState(businessId, waId);

          // ✅ Session expired -> reset
          if (isExpired(state)) {
            await resetConversationState(businessId, waId);
            state = await getOrCreateUserState(businessId, waId);
          }

          // ✅ Manual reset
          if (isResetRequest(textRaw)) {
            await resetConversationState(businessId, waId);
            state = await getOrCreateUserState(businessId, waId);

            await runWelcomeFlow({
              businessId,
              waId,
              lang: state.preferredLanguage,
              reason: "manual-reset",
            });

            await saveUserState(businessId, waId, { stage: "IDLE" });
            continue;
          }

          // ✅ Language selection
          const langPick = detectLanguageByKeyword(textRaw);
          if (langPick) {
            await saveUserState(businessId, waId, { preferredLanguage: langPick });

            await runWelcomeFlow({
              businessId,
              waId,
              lang: langPick,
              reason: "language-picked",
            });

            await saveUserState(businessId, waId, { stage: "IDLE" });
            continue;
          }

          // ✅ First time welcome
          if (state.stage === "WELCOME") {
            await runWelcomeFlow({
              businessId,
              waId,
              lang: state.preferredLanguage,
              reason: "first-welcome",
            });

            await saveUserState(businessId, waId, { stage: "IDLE" });
            continue;
          }

          // ✅ Main routing
          if (state.stage === "AWAIT_DATE" || state.stage === "AWAIT_SLOT_CHOICE") {
            await runSchedulingFlow({ businessId, waId, text: textRaw });
            continue;
          }

          // ✅ Otherwise idle handler decides whether to start scheduling or just explain
          await runIdleFlow({ businessId, waId, text: textRaw });
        }
      }
    }
  } catch (err) {
    console.error("[WEBHOOK_ERROR]", err);
  }
}
