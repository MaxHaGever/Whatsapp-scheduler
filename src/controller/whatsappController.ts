import type { Request, Response } from "express";
import { DateTime } from "luxon";

import { sendTextMessage } from "../services/whatsapp";
import { extractDateIntent } from "../services/aiDate";
import { proposeSlotsInWindow, bookSlot } from "../services/scheduling";
import {
  getOrCreateUserState,
  setPreferredLanguage,
  setStage,
  setPendingSlots,
  consumePendingSlot,
  setPendingCancelEvents,
  consumePendingCancelChoice,
} from "../services/state";
import {
  welcomeMessage,
  askWhenMessage,
  didntUnderstandDate,
  cancelPrompt,
  noAppointmentsToCancel,
} from "../services/messages";
import { listUpcomingBotEventsForUser, deleteEvent } from "../services/calendarOps";

const TZ = "Asia/Jerusalem";

function isCancelCommand(t: string) {
  const x = t.trim().toLowerCase();
  return x === "cancel" || x === "בטל" || x === "ביטול" || x.includes("לבטל");
}

function isNumberChoice(t: string) {
  return ["1", "2", "3", "4", "5"].includes(t.trim());
}

export function verifyWebhook(req: Request, res: Response) {
  const modeRaw = req.query["hub.mode"];
  const tokenRaw = req.query["hub.verify_token"];
  const challengeRaw = req.query["hub.challenge"];

  const mode = Array.isArray(modeRaw) ? modeRaw[0] : modeRaw;
  const token = Array.isArray(tokenRaw) ? tokenRaw[0] : tokenRaw;
  const challenge = Array.isArray(challengeRaw) ? challengeRaw[0] : challengeRaw;

  const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN;

  if (mode === "subscribe" && token === verifyToken && typeof challenge === "string") {
    return res.status(200).send(challenge);
  }

  return res.sendStatus(403);
}

export async function handleWebhook(req: Request, res: Response) {
  // ACK immediately
  res.sendStatus(200);

  try {
    const body = req.body;

    const change = body?.entry?.[0]?.changes?.[0];
    const value = change?.value;

    // Status updates
    if (value?.statuses?.length) {
      const s: { id?: string; status?: string } = value.statuses[0];
      console.log(`[WA STATUS] id=${s?.id} status=${s?.status}`);
      return;
    }

    const message = value?.messages?.[0];
    if (!message) return;

    const from: string | undefined = message.from;
    const type: string | undefined = message.type;
    if (!from) return;

    // Optional dev safety
    const allowed = process.env.WHATSAPP_TEST_RECIPIENT_WA_ID;
    if (allowed && from !== allowed) {
      console.log(`[SKIP] from=${from} not in allowed list`);
      return;
    }

    if (type !== "text") {
      console.log(`[INBOUND] from=${from} type=${type} (ignored)`);
      await sendTextMessage(from, "אפשר כרגע רק הודעות טקסט 🙂");
      return;
    }

    const text: string | undefined = message?.text?.body;
    if (!text) return;

    const trimmed = text.trim();
    console.log(`[INBOUND] from=${from} text="${trimmed}"`);

    const user = await getOrCreateUserState(from);

    // Language switch
    if (trimmed.toLowerCase() === "russian") {
      await setPreferredLanguage(from, "ru");
      await setStage(from, "awaiting_request");
      await sendTextMessage(from, askWhenMessage("ru"));
      return;
    }
    if (trimmed.toLowerCase() === "english") {
      await setPreferredLanguage(from, "en");
      await setStage(from, "awaiting_request");
      await sendTextMessage(from, askWhenMessage("en"));
      return;
    }
    if (trimmed === "עברית") {
      await setPreferredLanguage(from, "he");
      await setStage(from, "awaiting_request");
      await sendTextMessage(from, askWhenMessage("he"));
      return;
    }

    // First-time welcome
    if (user.stage === "new") {
      await setStage(from, "awaiting_request");
      await sendTextMessage(from, welcomeMessage());
      return;
    }

    // CANCEL FLOW
    if (isCancelCommand(trimmed)) {
      const events = await listUpcomingBotEventsForUser(from, 5);

      if (!events.length) {
        await sendTextMessage(from, noAppointmentsToCancel(user.preferredLanguage));
        await setStage(from, "awaiting_request");
        return;
      }

      const lines = events.map((e, i) => {
        const dt = DateTime.fromISO(e.startIso, { zone: TZ });
        return `${i + 1}) ${dt.toFormat("ccc dd/LL HH:mm")} — ${e.summary}`;
      });

      await setPendingCancelEvents(from, events.map((e) => e.id));
      await sendTextMessage(from, cancelPrompt(user.preferredLanguage, lines));
      return;
    }

    // If awaiting cancel choice
    if (user.stage === "awaiting_cancel_choice" && isNumberChoice(trimmed)) {
      const eventId = await consumePendingCancelChoice(from, Number(trimmed));
      if (!eventId) {
        await sendTextMessage(from, "האפשרויות פגו. שלח/י 'בטל' שוב כדי לראות רשימה חדשה.");
        return;
      }

      await deleteEvent(eventId);
      await sendTextMessage(from, "התור בוטל ✅");
      return;
    }

    // If choosing slot
    if (user.stage === "awaiting_slot_choice" && isNumberChoice(trimmed)) {
      const slot = await consumePendingSlot(from, Number(trimmed));
      if (!slot) {
        await sendTextMessage(from, "האפשרויות פגו. שלח/י שוב בקשה (למשל: 'מחר בבוקר').");
        return;
      }

      const confirmText = await bookSlot(from, slot);
      await sendTextMessage(from, confirmText);
      return;
    }

    // Otherwise: interpret as scheduling request via AI
    const intent = await extractDateIntent(trimmed);

    if (intent.needs_clarification || !intent.date) {
      await sendTextMessage(from, didntUnderstandDate(user.preferredLanguage));
      return;
    }

    const day = DateTime.fromISO(intent.date, { zone: TZ });

    // preference -> window
    let startHour = 9;
    let endHour = 17;
    const pref = intent.time_preference ?? "any";

    if (pref === "morning") {
      startHour = 9;
      endHour = 12;
    } else if (pref === "noon") {
      startHour = 12;
      endHour = 14;
    } else if (pref === "afternoon") {
      startHour = 14;
      endHour = 17;
    } else if (pref === "evening") {
      startHour = 17;
      endHour = 20;
    }

    const timeMin = day.set({ hour: startHour, minute: 0, second: 0, millisecond: 0 }).toISO()!;
    const timeMax = day.set({ hour: endHour, minute: 0, second: 0, millisecond: 0 }).toISO()!;

    const { slots, messageText } = await proposeSlotsInWindow(from, timeMin, timeMax, 30);

    // Store slots (so "1/2/3" works after restart)
    if (slots.length) {
      await setPendingSlots(from, slots);
    } else {
      await setStage(from, "awaiting_request");
    }

    await sendTextMessage(from, messageText);
  } catch (err) {
    console.error("[WEBHOOK_ERROR]", err);
  }
}
