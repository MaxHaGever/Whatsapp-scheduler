// src/controller/whatsappController.ts
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

// Scheduling flows (your new split)
import { runSchedulingProposeFlow } from "../flows/schedulingProposeFlow";
import { runSchedulingChoiceFlow } from "../flows/schedulingChoiceFlow";

// Cancel flow
import { runCancelFlow } from "../flows/cancelFlow";

function looksLikeNumberChoice(text: string) {
  const t = text.trim();
  return /^[1-9]\d*$/.test(t);
}

export async function handleWebhookPost(req: Request, res: Response) {
  // ACK immediately (Meta requires quick response)
  res.sendStatus(200);

  try {
    const body = req.body;

    // Meta can send multiple entries/changes/messages in one POST
    for (const entry of body?.entry ?? []) {
      for (const change of entry?.changes ?? []) {
        const value = change?.value;
        if (!value) continue;

        // Which business number received this event
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
            continue; // continues the "for (const change ...)" loop
          }

          // Dev fallback
          businessId = await getDefaultBusinessId();
        }

        // Status updates (delivered/read/etc)
        if (value?.statuses?.length) {
          for (const s of value.statuses) {
            console.log(
              `[WA STATUS] phoneNumberId=${phoneNumberId} id=${s?.id} status=${s?.status}`
            );
            if (s?.id && s?.status) {
              await updateMessageStatusByWaMessageId(businessId, s.id, s.status);
            }
          }
          continue;
        }

        // Inbound messages (can be more than one)
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

          // Extract text
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

          // Load state (scoped by businessId + waId)
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

          // Language selection (optional quick command)
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

          // First-time welcome
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

          // =========================
          // ✅ MAIN ROUTING
          // =========================

          // Scheduling: user is choosing a slot number (or writing a new date)
          if (state.stage === "SCHEDULING_AWAIT_SLOT") {
            if (!looksLikeNumberChoice(textRaw)) {
              // Not a number => treat as new date request / preference ("later", "tomorrow", "next week"...)
              await saveUserState(businessId, waId, { stage: "SCHEDULING_AWAIT_DATE" });
              await runSchedulingProposeFlow({ businessId, waId, text: textRaw });
              continue;
            }

            await runSchedulingChoiceFlow({ businessId, waId, text: textRaw });
            continue;
          }

          // Scheduling: user is describing date/time
          if (state.stage === "SCHEDULING_AWAIT_DATE") {
            await runSchedulingProposeFlow({ businessId, waId, text: textRaw });
            continue;
          }

          // Cancel: user needs to pick what to cancel (or first message triggers listing)
          if (state.stage === "CANCEL_AWAIT_TARGET") {
            await runCancelFlow({ businessId, waId, text: textRaw });
            continue;
          }

          // Reschedule (placeholder until you implement)
          if (state.stage === "RESCHEDULE_AWAIT_TARGET" || state.stage === "RESCHEDULE_AWAIT_NEW_DATE") {
            await sendAndStoreTextMessage({
              businessId,
              waId,
              body: "בקרוב נוכל גם לשנות תור 🙂 בינתיים אפשר לקבוע תור חדש או לבטל תור.",
              meta: { reason: "reschedule-not-implemented" },
            });
            await saveUserState(businessId, waId, { stage: "IDLE" });
            continue;
          }

          // ✅ IMPORTANT: Intent detection should run for BOTH AWAIT_INTENT and IDLE
          if (state.stage === "AWAIT_INTENT" || state.stage === "IDLE") {
            await runIntentDetectionFlow({ businessId, waId, text: textRaw });

            // Reload updated state (intent flow is responsible to set the next stage)
            state = await getOrCreateUserState(businessId, waId);

            // Route based on the stage that intent detection chose
            if (state.stage === "SCHEDULING_AWAIT_DATE") {
              await runSchedulingProposeFlow({ businessId, waId, text: textRaw });
              continue;
            }

            if (state.stage === "SCHEDULING_AWAIT_SLOT") {
              // Rare: intent flow might jump straight to slots stage (usually it won't)
              if (!looksLikeNumberChoice(textRaw)) {
                await saveUserState(businessId, waId, { stage: "SCHEDULING_AWAIT_DATE" });
                await runSchedulingProposeFlow({ businessId, waId, text: textRaw });
                continue;
              }

              await runSchedulingChoiceFlow({ businessId, waId, text: textRaw });
              continue;
            }

            if (state.stage === "CANCEL_AWAIT_TARGET") {
              await runCancelFlow({ businessId, waId, text: textRaw });
              continue;
            }

            if (
              state.stage === "RESCHEDULE_AWAIT_TARGET" ||
              state.stage === "RESCHEDULE_AWAIT_NEW_DATE"
            ) {
              await sendAndStoreTextMessage({
                businessId,
                waId,
                body: "בקרוב נוכל גם לשנות תור 🙂 בינתיים אפשר לקבוע תור חדש או לבטל תור.",
                meta: { reason: "reschedule-not-implemented" },
              });
              await saveUserState(businessId, waId, { stage: "IDLE" });
              continue;
            }

            // If intent detection couldn't decide, show help
            await runIdleFlow({ businessId, waId, text: textRaw });
            continue;
          }

          // Fallback (should rarely happen)
          await runIdleFlow({ businessId, waId, text: textRaw });
        }
      }
    }
  } catch (err) {
    console.error("[WEBHOOK_ERROR]", err);
  }
}
