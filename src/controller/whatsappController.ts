import type { Request, Response } from "express";
import { DateTime } from "luxon";

import { sendTextMessage } from "../services/whatsapp";
import { proposeSlotsInWindow, bookChosenSlot } from "../services/scheduling";
import { extractDateIntent } from "../services/aiDate";
import { getUserState, setUserState } from "../services/state";
import { welcomeMessage, askWhenMessage, didntUnderstandDate } from "../services/messages";

const TZ = "Asia/Jerusalem";

/**
 * GET /webhook/whatsapp
 * Meta webhook verification.
 */
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

/**
 * POST /webhook/whatsapp
 * Receives WhatsApp events.
 * MUST ack quickly.
 */
export async function handleWebhook(req: Request, res: Response) {
  // ACK immediately
  res.sendStatus(200);

  try {
    const body = req.body;

    const change = body?.entry?.[0]?.changes?.[0];
    const value = change?.value;

    // 1) Status updates (sent/delivered/read)
    if (value?.statuses?.length) {
      const s: { id?: string; status?: string } = value.statuses[0];
      console.log(`[WA STATUS] id=${s?.id} status=${s?.status}`);
      return;
    }

    // 2) Incoming message
    const message = value?.messages?.[0];
    if (!message) return;

    const from: string | undefined = message.from;
    const type: string | undefined = message.type;
    if (!from) return;

    // Optional: restrict to your number in dev
    const allowed = process.env.WHATSAPP_TEST_RECIPIENT_WA_ID;
    if (allowed && from !== allowed) {
      console.log(`[SKIP] from=${from} not in allowed list`);
      return;
    }

    // Only text supported now
    if (type !== "text") {
      console.log(`[INBOUND] from=${from} type=${type} (ignored)`);
      await sendTextMessage(from, "I can only process text messages for now 🙂");
      return;
    }

    const text: string | undefined = message?.text?.body;
    if (!text) return;

    const trimmed = text.trim();
    console.log(`[INBOUND] from=${from} text="${trimmed}"`);

    const state = getUserState(from);

    // Language switch command
    if (trimmed.toLowerCase() === "russian") {
      setUserState(from, { lang: "ru", stage: "awaiting_request" });
      await sendTextMessage(from, askWhenMessage("ru"));
      return;
    }

    // First contact → welcome
    if (state.stage === "new") {
      setUserState(from, { stage: "awaiting_request" });
      await sendTextMessage(from, welcomeMessage());
      return;
    }

    // Slot choice
    if (trimmed === "1" || trimmed === "2" || trimmed === "3") {
      const msg = await bookChosenSlot(from, Number(trimmed));
      await sendTextMessage(from, msg);
      return;
    }

    // Otherwise: interpret as scheduling request
    const intent = await extractDateIntent(trimmed);

    if (intent.needs_clarification || !intent.date) {
      await sendTextMessage(from, didntUnderstandDate(state.lang));
      return;
    }

    // Map time preference to a time window
    const day = DateTime.fromISO(intent.date, { zone: TZ });
    const pref = intent.time_preference ?? "any";

    let startHour = 9;
    let endHour = 17;

    if (pref === "morning") { startHour = 9; endHour = 12; }
    else if (pref === "noon") { startHour = 12; endHour = 14; }
    else if (pref === "afternoon") { startHour = 14; endHour = 17; }
    else if (pref === "evening") { startHour = 17; endHour = 20; }
    else { startHour = 9; endHour = 17; }

    const timeMin = day.set({ hour: startHour, minute: 0, second: 0, millisecond: 0 }).toISO()!;
    const timeMax = day.set({ hour: endHour, minute: 0, second: 0, millisecond: 0 }).toISO()!;

    const msg = await proposeSlotsInWindow(from, timeMin, timeMax, 30);
    await sendTextMessage(from, msg);

    setUserState(from, { stage: "awaiting_slot_choice" });
  } catch (err) {
    console.error("[WEBHOOK_ERROR]", err);
  }
}
