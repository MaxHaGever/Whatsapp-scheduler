import { Request, Response } from "express";
import { sendTextMessage } from "../services/whatsapp";
import { extractDateIntent } from "../services/aiDate";
import {
  proposeNextSlots,
  bookChosenSlot,
  listUserAppointments,
  cancelUserAppointment,
  Slot,
} from "../services/scheduling";

type Lang = "he" | "ru" | "en" | "unknown";

// simple memory (replace later with Mongo):
const session = new Map<
  string,
  {
    lang: Lang;
    lastSlots: Slot[];
    pendingDateIso: string | null;
  }
>();

function getSession(waId: string) {
  const existing = session.get(waId);
  if (existing) return existing;
  const fresh = { lang: "he" as Lang, lastSlots: [], pendingDateIso: null };
  session.set(waId, fresh);
  return fresh;
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
      const st = value.statuses[0];
      console.log(`[WA STATUS] id=${st?.id} status=${st?.status}`);
      return;
    }

    const message = value?.messages?.[0];
    if (!message) return;

    const from: string | undefined = message.from;
    const type: string | undefined = message.type;
    if (!from) return;

    // dev allowlist (optional)
    const allowed = process.env.WHATSAPP_TEST_RECIPIENT_WA_ID;
    if (allowed && from !== allowed) {
      console.log(`[SKIP] from=${from} not in allowed list`);
      return;
    }

    if (type !== "text") {
      await sendTextMessage(from, "כרגע אני יודע/ת לטפל רק בהודעות טקסט 🙂");
      return;
    }

    const text: string = message?.text?.body ?? "";
    console.log(`[INBOUND] from=${from} text="${text}"`);

    const s = getSession(from);

    // Language switch
    if (text.trim().toLowerCase() === "russian") {
      s.lang = "ru";
      await sendTextMessage(from, "Отлично! Напишите, когда вы хотите прийти (например: «в следующий вторник утром»).");
      return;
    }

    // Cancel flow (simple keyword)
    if (text.includes("לבטל") || text.toLowerCase().includes("cancel")) {
      const apps = await listUserAppointments({ waId: from, maxResults: 5 });
      if (apps.length === 0) {
        await sendTextMessage(from, "לא מצאתי תורים קיימים לביטול.");
        return;
      }

      const lines = apps.map((a, idx) => `${idx + 1}) ${a.startIso} — ${a.summary}`);
      await sendTextMessage(from, `איזה תור לבטל?\n${lines.join("\n")}\nהשב/י עם המספר.`);
      // store “lastSlots” not relevant here; you'd store list for cancel in DB later
      // quick hack: store eventIds inside lastSlots label
      s.lastSlots = apps.map((a) => ({ startIso: a.startIso, endIso: "", label: a.eventId })) as Slot[];
      return;
    }

    // If user replied with a number after cancel prompt
    if (/^\d+$/.test(text.trim()) && s.lastSlots.length && s.lastSlots[0].endIso === "") {
      const idx = Number(text.trim()) - 1;
      const picked = s.lastSlots[idx];
      if (!picked) {
        await sendTextMessage(from, "מספר לא תקין. נסה/י שוב.");
        return;
      }
      const eventId = picked.label;
      const result = await cancelUserAppointment({ waId: from, eventId });
      if (!result.ok) {
        await sendTextMessage(from, `לא הצלחתי לבטל: ${result.reason}`);
        return;
      }
      await sendTextMessage(from, "✅ התור בוטל.");
      s.lastSlots = [];
      return;
    }

    // If user picks a slot number 1/2/3
    if (/^[1-3]$/.test(text.trim()) && s.lastSlots.length > 0) {
      const idx = Number(text.trim()) - 1;
      const picked = s.lastSlots[idx];
      if (!picked) {
        await sendTextMessage(from, "מספר לא תקין. נסה/י שוב.");
        return;
      }

      const booked = await bookChosenSlot({
        waId: from,
        startIso: picked.startIso,
        endIso: picked.endIso,
        summary: "Clinic Appointment",
      });

      await sendTextMessage(from, `✅ נקבע!\n${picked.label}`);
      // clear pending
      s.lastSlots = [];
      s.pendingDateIso = null;
      return;
    }

    // Otherwise: AI extract date intent
    const intent = await extractDateIntent(text);
    if (intent.language !== "unknown") s.lang = intent.language;

    if (intent.needs_clarification || !intent.date) {
      await sendTextMessage(
        from,
        s.lang === "ru"
          ? "Я не понял дату. Напишите, пожалуйста, день (например: «в следующее воскресенье» или «завтра утром»)."
          : "לא הבנתי את התאריך. כתבו בבקשה יום (לדוגמה: ״בראשון הבא״ / ״מחר בבוקר״)."
      );
      return;
    }

    // Propose slots for that day
    s.pendingDateIso = intent.date;
    const slots = await proposeNextSlots({
      dateIso: intent.date,
      lang: s.lang,
    });

    if (slots.length === 0) {
      await sendTextMessage(from, "לא מצאתי תורים פנויים ביום הזה. נסו תאריך אחר.");
      return;
    }

    s.lastSlots = slots;

    // ✅ FIX FOR YOUR ERROR: type the callback params (s: Slot)
    const options = slots.map((slot: Slot, idx: number) => `${idx + 1}) ${slot.label}`);

    await sendTextMessage(from, `מצאתי תורים פנויים:\n${options.join("\n")}\nהשב/י עם 1/2/3 כדי לבחור.`);
  } catch (err) {
    console.error("[WEBHOOK_ERROR]", err);
  }
}
