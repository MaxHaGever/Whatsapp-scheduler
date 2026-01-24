import { Router } from "express";
import { DateTime } from "luxon";

import { sendTextMessage } from "../services/whatsapp";
import { proposeSlotsInWindow, bookChosenSlot } from "../services/scheduling";
import { extractDateIntent } from "../services/aiDateIntent";
import { getUserState, setUserState } from "../services/state";
import { welcomeMessage, askWhenMessage, didntUnderstandDate } from "../services/messages";

const router = Router();

/**
 * GET /webhook/whatsapp
 * Meta webhook verification.
 */
router.get("/", (req, res) => {
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
});

/**
 * POST /webhook/whatsapp
 * Receives incoming WhatsApp events.
 * IMPORTANT: respond quickly with 200 (Meta retries if you don't).
 */
router.post("/", async (req, res) => {
  // Always ACK immediately (don't block on any logic)
  res.sendStatus(200);

  try {
    const body = req.body;

    // WhatsApp Cloud API message payload lives here
    const change = body?.entry?.[0]?.changes?.[0];
    const value = change?.value;

    // 1) Ignore delivery/status updates (we only care about incoming messages for now)
    // Status events look like: value.statuses = [...]
    if (value?.statuses?.length) {
      const s = value.statuses[0];
      console.log(`[WA STATUS] id=${s?.id} status=${s?.status}`);
      return;
    }

    // 2) Parse incoming message
    const message = value?.messages?.[0];
    if (!message) return;

    const from: string | undefined = message.from; // user's WA ID (digits)
    const type: string | undefined = message.type;

    if (!from) return;

    // Optional safety: in dev sandbox, only reply to your own number
    // Put your number in .env like: WHATSAPP_TEST_RECIPIENT_WA_ID=9725XXXXXXXX
    const allowed = process.env.WHATSAPP_TEST_RECIPIENT_WA_ID;
    if (allowed && from !== allowed) {
      console.log(`[SKIP] from=${from} not in allowed list`);
      return;
    }

    // 3) Handle only text for now
    if (type !== "text") {
      console.log(`[INBOUND] from=${from} type=${type} (ignored for now)`);
      await sendTextMessage(from, "I can only process text messages for now 🙂");
      return;
    }

    const text: string | undefined = message?.text?.body;
    if (!text) return;

    console.log(`[INBOUND] from=${from} text="${text}"`);

    const state = getUserState(from);
    const trimmed = text.trim();

    // Language switch command
    if (trimmed.toLowerCase() === "russian") {
      setUserState(from, { lang: "ru", stage: "awaiting_request" });
      await sendTextMessage(from, askWhenMessage("ru"));
      return;
    }

    // First contact: show welcome, then wait for the user's request
    if (state.stage === "new") {
      setUserState(from, { stage: "awaiting_request" }); // default Hebrew
      await sendTextMessage(from, welcomeMessage());
      return;
    }

    // Slot choice (1/2/3)
    if (trimmed === "1" || trimmed === "2" || trimmed === "3") {
      const msg = await bookChosenSlot(from, Number(trimmed));
      await sendTextMessage(from, msg);
      return;
    }

    // Otherwise: treat message as “request for an appointment” → AI extracts date intent
    const intent = await extractDateIntent(trimmed);

    if (!intent.ok) {
      await sendTextMessage(from, didntUnderstandDate(state.lang));
      return;
    }

    if (intent.kind === "single_day") {
      const day = DateTime.fromISO(intent.date, { zone: "Asia/Jerusalem" });
      const timeMin = day.startOf("day").toISO()!;
      const timeMax = day.endOf("day").toISO()!;

      const msg = await proposeSlotsInWindow(from, timeMin, timeMax, 30);
      await sendTextMessage(from, msg);

      setUserState(from, { stage: "awaiting_slot_choice" });
      return;
    }

    if (intent.kind === "range") {
      const msg = await proposeSlotsInWindow(from, intent.start, intent.end, 30);
      await sendTextMessage(from, msg);

      setUserState(from, { stage: "awaiting_slot_choice" });
      return;
    }
  } catch (err) {
    // Make sure this doesn't crash your webhook
    console.error("[WEBHOOK_ERROR]", err);
  }
});

export default router;
