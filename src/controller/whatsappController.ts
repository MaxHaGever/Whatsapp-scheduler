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

import { runIntentDetectionFlow } from "../flows/intentDetectionFlow";
import { runSchedulingProposeFlow } from "../flows/schedulingProposeFlow";
import { runSchedulingChoiceFlow } from "../flows/schedulingChoiceFlow";

function looksLikeNumberChoice(text: string) {
  return /^[1-9]\d*$/.test(text.trim());
}

export async function handleWebhookPost(req: Request, res: Response) {
  // ACK immediately (Meta requires quick response)
  res.sendStatus(200);

  try {
    const body = req.body;

    for (const entry of body?.entry ?? []) {
      for (const change of entry?.changes ?? []) {
        const value = change?.value;
        if (!value) continue;

        const phoneNumberId: string | undefined = value?.metadata?.phone_number_id;
        if (!phoneNumberId) continue;

        // Resolve Business from phone_number_id (fallback to default for dev/testing)
        const businessDoc = await BusinessModel.findOne({ phoneNumberId }).lean();

        let businessId: string;

        if (businessDoc) {
          businessId = String((businessDoc as any)._id);
        } else {
          // Production safety: don't route unknown numbers to default
          if (process.env.NODE_ENV === "production") {
            console.warn(`[WEBHOOK] Unknown phoneNumberId=${phoneNumberId} - ignoring`);
            continue;
          }
          businessId = await getDefaultBusinessId();
        }

        // Status updates
        if (value?.statuses?.length) {
          const s = value.statuses[0];
          console.log(
            `[WA STATUS] phoneNumberId=${phoneNumberId} id=${s?.id} status=${s?.status}`
          );

          if (s?.id && s?.status) {
            await updateMessageStatusByWaMessageId(businessId, s.id, s.status);
          }
          continue;
        }

        // Inbound messages
        const messages = value?.messages ?? [];
        for (const message of messages) {
          if (!message) continue;

          const waId: string | undefined = message.from;
          const type: string | undefined = message.type;
          if (!waId) continue;

          // Non-text message -> respond
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

          // Always store inbound message
          await saveInboundMessage({
            businessId,
            waId,
            body: textRaw,
            waMessageId: message.id ?? null,
            meta: { source: "webhook", phoneNumberId },
          });

          // Load state
          let state = await getOrCreateUserState(businessId, waId);

          // Session expired -> reset
          if (isExpired(state)) {
            await resetConversationState(businessId, waId);
            state = await getOrCreateUserState(businessId, waId);
          }

          // Manual reset
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

          // Language selection
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

          // WELCOME -> send welcome and move to AWAIT_INTENT
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

          // AWAIT_INTENT -> detect intent and IMMEDIATELY respond by running next flow
          if (state.stage === "AWAIT_INTENT") {
            await runIntentDetectionFlow({ businessId, waId, text: textRaw });

            // reload updated state
            state = await getOrCreateUserState(businessId, waId);

            if (state.stage === "SCHEDULING_AWAIT_DATE") {
              await runSchedulingProposeFlow({ businessId, waId, text: textRaw });
              continue;
            }

            if (state.stage === "CANCEL_AWAIT_TARGET") {
              await sendAndStoreTextMessage({
                businessId,
                waId,
                body: 'אוקיי 🙂 איזה תור לבטל? כתבו תאריך/יום (למשל "מחר") או כתבו: "התורים שלי".',
                meta: { reason: "cancel-start" },
              });
              continue;
            }

            if (state.stage === "RESCHEDULE_AWAIT_TARGET") {
              await sendAndStoreTextMessage({
                businessId,
                waId,
                body: 'אוקיי 🙂 איזה תור לשנות? כתבו תאריך/יום או כתבו: "התורים שלי".',
                meta: { reason: "reschedule-start" },
              });
              continue;
            }

            // fallback
            await runIdleFlow({ businessId, waId, text: textRaw });
            continue;
          }

          // Scheduling (date stage) -> propose slots
          if (state.stage === "SCHEDULING_AWAIT_DATE") {
            await runSchedulingProposeFlow({ businessId, waId, text: textRaw });
            continue;
          }

          // Scheduling (slot stage) -> book or adjust
          if (state.stage === "SCHEDULING_AWAIT_SLOT") {
            // if not a number, treat this message as "change the date" and go back to date stage
            if (!looksLikeNumberChoice(textRaw)) {
              await saveUserState(businessId, waId, { stage: "SCHEDULING_AWAIT_DATE" });
              await runSchedulingProposeFlow({ businessId, waId, text: textRaw });
              continue;
            }

            await runSchedulingChoiceFlow({ businessId, waId, text: textRaw });
            continue;
          }

          // Cancel / Reschedule stages (not fully implemented yet)
          if (state.stage === "CANCEL_AWAIT_TARGET") {
            await sendAndStoreTextMessage({
              businessId,
              waId,
              body: 'כדי לבטל תור: כתבו "התורים שלי" ואז בחרו מספר. (בקרוב נעדכן 🙂)',
              meta: { reason: "cancel-not-implemented" },
            });
            await saveUserState(businessId, waId, { stage: "IDLE" });
            continue;
          }

          if (state.stage === "RESCHEDULE_AWAIT_TARGET" || state.stage === "RESCHEDULE_AWAIT_NEW_DATE") {
            await sendAndStoreTextMessage({
              businessId,
              waId,
              body: "בקרוב נוכל גם לשנות תור 🙂 בינתיים אפשר לקבוע תור חדש.",
              meta: { reason: "reschedule-not-implemented" },
            });
            await saveUserState(businessId, waId, { stage: "IDLE" });
            continue;
          }

          // Otherwise idle
          await runIdleFlow({ businessId, waId, text: textRaw });
        }
      }
    }
  } catch (err) {
    console.error("[WEBHOOK_ERROR]", err);
  }
}
