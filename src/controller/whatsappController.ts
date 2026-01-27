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
import { runSchedulingDateFlow } from "../flows/schedulingDateFlow";
import { runSchedulingChoiceFlow } from "../flows/schedulingChoiceFlow";

export async function handleWebhookPost(req: Request, res: Response) {
  // ACK immediately
  res.sendStatus(200);

  try {
    const body = req.body;

    for (const entry of body?.entry ?? []) {
      for (const change of entry?.changes ?? []) {
        const value = change?.value;
        if (!value) continue;

        const phoneNumberId: string | undefined = value?.metadata?.phone_number_id;
        if (!phoneNumberId) continue;

        const businessDoc = await BusinessModel.findOne({ phoneNumberId }).lean();
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

        // Status updates
        if (value?.statuses?.length) {
          const s = value.statuses[0];
          console.log(`[WA STATUS] phoneNumberId=${phoneNumberId} id=${s?.id} status=${s?.status}`);
          if (s?.id && s?.status) {
            await updateMessageStatusByWaMessageId(businessId, s.id, s.status);
          }
          continue;
        }

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

          if (isExpired(state)) {
            await resetConversationState(businessId, waId);
            state = await getOrCreateUserState(businessId, waId);
          }

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

          // WELCOME stage: send welcome and move to AWAIT_INTENT
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

          // Intent stage
          if (state.stage === "AWAIT_INTENT") {
            await runIntentDetectionFlow({ businessId, waId, text: textRaw });
            // After this call, state will be updated to scheduling/cancel/reschedule/idle
            continue;
          }

          // Scheduling: date stage
          if (state.stage === "SCHEDULING_AWAIT_DATE") {
            await runSchedulingDateFlow({ businessId, waId, text: textRaw });
            continue;
          }

          // Scheduling: slot choice stage (numbers / more / new date)
          if (state.stage === "SCHEDULING_AWAIT_SLOT") {
            await runSchedulingChoiceFlow({ businessId, waId, text: textRaw });
            continue;
          }

          // TODO: CANCEL flows and RESCHEDULE flows will go here (you already had cancel working)
          // For now, fallback to intent detection if user types something unexpected:
          await runIntentDetectionFlow({ businessId, waId, text: textRaw });
        }
      }
    }
  } catch (err) {
    console.error("[WEBHOOK_ERROR]", err);
  }
}
