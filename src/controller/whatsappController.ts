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
import { runIntentDetectionFlow } from "../flows/intentDetectionFlow";

// scheduling split flows (your repo already has these names from grep)
import { runSchedulingProposeFlow } from "../flows/schedulingProposeFlow";
import { runSchedulingChoiceFlow } from "../flows/schedulingChoiceFlow";

// cancel/reschedule flows (must exist)
import { runCancelFlow } from "../flows/cancelFlow";
import { runRescheduleFlow } from "../flows/rescheduleFlow";

export async function handleWebhookPost(req: Request, res: Response) {
  // Meta requires quick response
  res.sendStatus(200);

  try {
    const body = req.body;

    for (const entry of body?.entry ?? []) {
      for (const change of entry?.changes ?? []) {
        const value = change?.value;
        if (!value) continue;

        const phoneNumberId: string | undefined = value?.metadata?.phone_number_id;
        if (!phoneNumberId) continue;

        // resolve businessId
        const businessDoc =
        (await BusinessModel.findOne({ whatsappPhoneNumberId: phoneNumberId }).lean()) ||
        (await BusinessModel.findOne({ phoneNumberId }).lean()); // backward compat

        let businessId: string;

        if (businessDoc) {
          businessId = String((businessDoc as any)._id);
        } else {
          if (process.env.NODE_ENV === "production") {
            console.warn(`[WEBHOOK] Unknown phoneNumberId=${phoneNumberId} - ignoring`);
            continue;
          }
          businessId = await getDefaultBusinessId();
        }

        // statuses
        if (value?.statuses?.length) {
          const s = value.statuses[0];
          console.log(`[WA STATUS] phoneNumberId=${phoneNumberId} id=${s?.id} status=${s?.status}`);
          if (s?.id && s?.status) {
            await updateMessageStatusByWaMessageId(businessId, s.id, s.status);
          }
          continue;
        }

        // inbound messages
        const messages = value?.messages ?? [];
        for (const message of messages) {
          if (!message) continue;

          const waId: string | undefined = message.from;
          const type: string | undefined = message.type;
          if (!waId) continue;

          if (type !== "text") {
            await sendAndStoreTextMessage({
              businessId,
              waId,
              body: "אני יכול לעבד רק הודעות טקסט כרגע 🙂",
              meta: { reason: "non-text", inboundType: type, phoneNumberId },
            });
            continue;
          }

          const textRaw: string | undefined = message?.text?.body;
          if (!textRaw) continue;

          console.log(`[INBOUND] phoneNumberId=${phoneNumberId} from=${waId} text="${textRaw}"`);

          await saveInboundMessage({
            businessId,
            waId,
            body: textRaw,
            waMessageId: message.id ?? null,
            meta: { source: "webhook", phoneNumberId },
          });

          let state = await getOrCreateUserState(businessId, waId);
          console.log(`[STATE] stage=${state.stage} lang=${state.preferredLanguage}`);

          // expired session
          if (isExpired(state)) {
            await resetConversationState(businessId, waId);
            state = await getOrCreateUserState(businessId, waId);
          }

          // manual reset
          if (isResetRequest(textRaw)) {
            await resetConversationState(businessId, waId);
            state = await getOrCreateUserState(businessId, waId);

            await runWelcomeFlow({
              businessId,
              waId,
              lang: state.preferredLanguage,
              reason: "manual-reset",
            });

            await saveUserState(businessId, waId, { stage: "AWAIT_INTENT" });
            continue;
          }

          // language selection keywords
          const langPick = detectLanguageByKeyword(textRaw);
          if (langPick) {
            await saveUserState(businessId, waId, { preferredLanguage: langPick });

            await runWelcomeFlow({
              businessId,
              waId,
              lang: langPick,
              reason: "language-picked",
            });

            await saveUserState(businessId, waId, { stage: "AWAIT_INTENT" });
            continue;
          }

          // first welcome
          if (state.stage === "WELCOME") {
            await runWelcomeFlow({
              businessId,
              waId,
              lang: state.preferredLanguage,
              reason: "first-welcome",
            });

            await saveUserState(businessId, waId, { stage: "AWAIT_INTENT" });
            continue;
          }

          // intent detection
          if (state.stage === "AWAIT_INTENT" || state.stage === "IDLE") {
            await runIntentDetectionFlow({ businessId, waId, text: textRaw });
            continue;
          }

          // scheduling
          if (state.stage === "SCHEDULING_AWAIT_DATE") {
            await runSchedulingProposeFlow({ businessId, waId, text: textRaw });
            continue;
          }

          if (state.stage === "SCHEDULING_AWAIT_SLOT") {
            await runSchedulingChoiceFlow({ businessId, waId, text: textRaw });
            continue;
          }

          // cancel
          if (state.stage === "CANCEL_AWAIT_TARGET") {
            await runCancelFlow({ businessId, waId, text: textRaw });
            continue;
          }

          // reschedule (your flow should internally handle which substage)
          if (
            state.stage === "RESCHEDULE_AWAIT_TARGET" ||
            state.stage === "RESCHEDULE_AWAIT_NEW_DATE"
          ) {
            await runRescheduleFlow({ businessId, waId, text: textRaw });
            continue;
          }

          // safety fallback
          await saveUserState(businessId, waId, { stage: "AWAIT_INTENT" });
          await runIntentDetectionFlow({ businessId, waId, text: textRaw });
        }
      }
    }
  } catch (err) {
    console.error("[WEBHOOK_ERROR]", err);
  }
}
