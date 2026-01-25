import { Request, Response } from "express";
import { sendTextMessage } from "../services/whatsapp";
import { extractDateIntent } from "../services/aiDate";
import {
  proposeSlotsWithFallback,
  bookChosenSlot,
  listUpcomingAppointments,
  cancelAppointmentByEventId,
  Slot,
} from "../services/scheduling";
import {
  getOrCreateUserState,
  saveUserState,
  resetConversationState,
  isExpired,
  Lang,
  UserState,
} from "../services/state";

function normalizeText(t: string) {
  return t.trim().toLowerCase();
}

const TZ = process.env.TZ || "Asia/Jerusalem";

function detectLanguageByKeyword(textRaw: string): Lang | null {
  const t = normalizeText(textRaw);
  if (t === "russian" || t === "ru") return "ru";
  if (t === "english" || t === "en") return "en";
  if (t === "עברית" || t === "hebrew" || t === "he") return "he";
  return null;
}

function welcomeMessage(lang: Lang) {
  if (lang === "ru") {
    return (
      "👋 Добро пожаловать в нашу клинику.\n" +
      "Это сервис записи в WhatsApp.\n" +
      "Напишите, когда вы хотите прийти (например: «завтра утром», «в следующий вторник»).\n\n" +
      "Для иврита: напишите Hebrew / עברית\n" +
      "For English: write English"
    );
  }
  if (lang === "en") {
    return (
      "👋 Welcome to our clinic.\n" +
      "This is a WhatsApp scheduling service.\n" +
      "Please tell us when you’d like to visit (e.g. “tomorrow morning”, “next Tuesday”).\n\n" +
      "For Russian: type russian\n" +
      "לעברית: כתבו עברית"
    );
  }

  // he
  return (
    "👋 ברוכים הבאים למרפאה.\n" +
    "זהו שירות קביעת תורים בוואטסאפ.\n" +
    "אנא כתבו מתי תרצו להגיע (לדוגמה: \"מחר בבוקר\", \"בראשון הבא\").\n\n" +
    "לרוסית כתבו: russian\n" +
    "For English: write English"
  );
}

function askForDate(lang: Lang) {
  if (lang === "ru") return "Напишите день/время, например: «завтра утром» / «в следующий вторник».";
  if (lang === "en") return "Tell me a day/time, e.g. “tomorrow morning” / “next Tuesday”.";
  return 'כתבו בבקשה יום (למשל: "בראשון הבא", "מחר בבוקר").';
}

function slotsMessage(lang: Lang, slots: Slot[]) {
  if (!slots.length) {
    if (lang === "ru") return "Не нашёл свободных слотов. Попробуйте другую дату.";
    if (lang === "en") return "No available slots found. Please try another date.";
    return "לא מצאתי תורים פנויים. נסו תאריך אחר.";
  }

  const lines = slots.map((s, i) => `${i + 1}) ${s.label}`).join("\n");
  if (lang === "ru") return `Нашёл свободные слоты:\n${lines}\n\nОтветьте 1 / 2 / 3 чтобы выбрать.`;
  if (lang === "en") return `Available slots:\n${lines}\n\nReply 1 / 2 / 3 to choose.`;
  return `מצאתי תורים פנויים:\n${lines}\n\nהשיבו עם 1/2/3 כדי לבחור.`;
}

function bookedMessage(lang: Lang, chosenLabel: string) {
  if (lang === "ru") return `✅ Записано: ${chosenLabel}`;
  if (lang === "en") return `✅ Booked: ${chosenLabel}`;
  return `✅ נקבע: ${chosenLabel}`;
}

function cancelIntro(lang: Lang) {
  if (lang === "ru") return "איזה תור לבטל? (בחר מספר)";
  if (lang === "en") return "Which appointment should I cancel? (reply with a number)";
  return "איזה תור לבטל? השיבו עם המספר.";
}

function noAppointments(lang: Lang) {
  if (lang === "ru") return "אין תורים עתידיים לביטול.";
  if (lang === "en") return "No upcoming appointments to cancel.";
  return "אין תורים עתידיים לביטול.";
}

function listAppointmentsMessage(lang: Lang, appts: { label: string; eventId: string }[]) {
  const lines = appts.map((a, i) => `${i + 1}) ${a.label}`).join("\n");
  if (lang === "ru") return `Ваши ближайшие записи:\n${lines}\n\nОтветьте цифрой כדי לבטל.`;
  if (lang === "en") return `Your upcoming appointments:\n${lines}\n\nReply with a number to cancel.`;
  return `התורים הקרובים שלך:\n${lines}\n\nהשיבו עם מספר כדי לבטל.`;
}

function cancelledMessage(lang: Lang) {
  if (lang === "ru") return "✅ התור בוטל";
  if (lang === "en") return "✅ Appointment cancelled";
  return "✅ התור בוטל";
}

function cantUnderstand(lang: Lang) {
  if (lang === "ru") return "לא בטוח שהבנתי. כתבו תאריך/יום (למשל: \"מחר בבוקר\").";
  if (lang === "en") return "I’m not sure I understood. Please write a day/date (e.g. “tomorrow morning”).";
  return 'לא הבנתי את התאריך. נסו שוב (למשל: "בראשון הבא", "מחר בבוקר").';
}

function isCancelRequest(text: string) {
  const t = normalizeText(text);
  return t.includes("בטל") || t.includes("לבטל") || t.includes("cancel");
}
function isListRequest(text: string) {
  const t = normalizeText(text);
  return t.includes("התורים") || t.includes("תורים שלי") || t.includes("my appointments");
}

export async function handleWebhookPost(req: Request, res: Response) {
  // ACK immediately
  res.sendStatus(200);

  try {
    const body = req.body;
    const change = body?.entry?.[0]?.changes?.[0];
    const value = change?.value;

    // status updates
    if (value?.statuses?.length) {
      const s = value.statuses[0];
      console.log(`[WA STATUS] id=${s?.id} status=${s?.status}`);
      return;
    }

    const message = value?.messages?.[0];
    if (!message) return;

    const waId: string | undefined = message.from;
    const type: string | undefined = message.type;
    if (!waId) return;

    if (type !== "text") {
      console.log(`[INBOUND] from=${waId} type=${type} ignored`);
      await sendTextMessage(waId, "אני יכול לעבד רק הודעות טקסט כרגע 🙂");
      return;
    }

    const textRaw: string | undefined = message?.text?.body;
    if (!textRaw) return;

    console.log(`[INBOUND] from=${waId} text="${textRaw}"`);

    // Load state
    let state = await getOrCreateUserState(waId);

    // Expire session -> reset flow, keep language
    if (isExpired(state)) {
      await resetConversationState(waId);
      state = await getOrCreateUserState(waId);
      await saveUserState(waId, { preferredLanguage: state.preferredLanguage, stage: "WELCOME" });
    }

    // Manual reset
    if (normalizeText(textRaw) === "reset" || normalizeText(textRaw) === "איפוס" || normalizeText(textRaw) === "אפס") {
      await resetConversationState(waId);
      state = await getOrCreateUserState(waId);
      await sendTextMessage(waId, welcomeMessage(state.preferredLanguage));
      await saveUserState(waId, { stage: "AWAIT_DATE" });
      return;
    }

    // Language selection
    const langPick = detectLanguageByKeyword(textRaw);
    if (langPick) {
      await saveUserState(waId, { preferredLanguage: langPick });
      await sendTextMessage(waId, welcomeMessage(langPick));
      await saveUserState(waId, { stage: "AWAIT_DATE" });
      return;
    }

    const lang = state.preferredLanguage;

    // WELCOME stage -> greet once, then ask date
    if (state.stage === "WELCOME") {
      await sendTextMessage(waId, welcomeMessage(lang));
      await saveUserState(waId, { stage: "AWAIT_DATE" });
      return;
    }

    // List appointments
    if (isListRequest(textRaw)) {
      const appts = await listUpcomingAppointments(waId, 10);
      if (!appts.length) {
        await sendTextMessage(waId, noAppointments(lang));
        return;
      }
      // We already format labels in scheduling.ts via slot label,
      // but appointments come from calendar -> format here
      const formatted = appts.map(a => ({
        eventId: a.eventId,
        label: formatAppointmentLabel(a.startIso, lang, a.summary),
      }));
      await sendTextMessage(waId, listAppointmentsMessage(lang, formatted));
      await saveUserState(waId, { stage: "CANCEL_PICK" }); // allow cancel by number
      return;
    }

    // Cancel flow request
    if (isCancelRequest(textRaw)) {
      const appts = await listUpcomingAppointments(waId, 10);
      if (!appts.length) {
        await sendTextMessage(waId, noAppointments(lang));
        return;
      }
      const formatted = appts.map(a => ({
        eventId: a.eventId,
        label: formatAppointmentLabel(a.startIso, lang, a.summary),
      }));
      await sendTextMessage(waId, listAppointmentsMessage(lang, formatted));
      // store mapping in state so number -> eventId
      await saveUserState(waId, {
        stage: "CANCEL_PICK",
        pendingSlots: formatted.map(f => ({ startIso: f.eventId, endIso: "", label: f.label })) as any,
      });
      return;
    }

    // CANCEL_PICK: user replies with a number
    if (state.stage === "CANCEL_PICK") {
      const n = Number(normalizeText(textRaw));
      if (!Number.isFinite(n) || n < 1 || n > 10) {
        await sendTextMessage(waId, cancelIntro(lang));
        return;
      }
      const refreshed = await getOrCreateUserState(waId);
      const pending = (refreshed.pendingSlots || []) as any[];
      const idx = n - 1;
      const eventId = pending?.[idx]?.startIso; // we stored eventId in startIso above
      if (!eventId) {
        await sendTextMessage(waId, cantUnderstand(lang));
        return;
      }
      await cancelAppointmentByEventId(eventId);
      await sendTextMessage(waId, cancelledMessage(lang));
      await saveUserState(waId, { stage: "AWAIT_DATE", pendingSlots: undefined });
      return;
    }

    // AWAIT_SLOT_CHOICE: user picks 1/2/3
    if (state.stage === "AWAIT_SLOT_CHOICE") {
      const n = Number(normalizeText(textRaw));
      const slots = state.pendingSlots || [];
      if (!Number.isFinite(n) || n < 1 || n > slots.length) {
        await sendTextMessage(waId, slotsMessage(lang, slots as any));
        return;
      }
      const chosen = slots[n - 1];

      const booked = await bookChosenSlot({
        waId,
        startIso: chosen.startIso,
        endIso: chosen.endIso,
        summary: "Clinic Appointment",
      });

      await sendTextMessage(waId, bookedMessage(lang, chosen.label));
      await saveUserState(waId, {
        stage: "AWAIT_DATE",
        pendingSlots: undefined,
        pendingDayIso: undefined,
      });
      return;
    }

    // Otherwise: interpret as scheduling request (AWAIT_DATE)
    const intent = await extractDateIntent(textRaw);

    // Update preferred language if AI detected it confidently
    if (intent.language === "he" || intent.language === "ru" || intent.language === "en") {
      await saveUserState(waId, { preferredLanguage: intent.language });
    }

    const useLang: Lang =
      intent.language === "he" || intent.language === "ru" || intent.language === "en"
        ? intent.language
        : lang;

    if (intent.needs_clarification || !intent.date) {
      await sendTextMessage(waId, askForDate(useLang));
      await saveUserState(waId, { stage: "AWAIT_DATE" });
      return;
    }

    // Propose slots (with fallback)
    const packs = await proposeSlotsWithFallback({ dayIsoDate: intent.date, lang: useLang });

    // Choose first day that has slots
    const firstWithSlots = packs.find(p => p.slots.length);
    if (!firstWithSlots) {
      await sendTextMessage(waId, cantUnderstand(useLang));
      return;
    }

    await sendTextMessage(waId, slotsMessage(useLang, firstWithSlots.slots));
    await saveUserState(waId, {
      stage: "AWAIT_SLOT_CHOICE",
      pendingDayIso: firstWithSlots.day,
      pendingSlots: firstWithSlots.slots,
      preferredLanguage: useLang,
    });
  } catch (err) {
    console.error("[WEBHOOK_ERROR]", err);
  }
}

// Helper: appointment label formatting (same style as slots)
import { DateTime } from "luxon";
function formatAppointmentLabel(startIso: string, lang: Lang, summary: string) {
  const dt = DateTime.fromISO(startIso, { zone: TZ });
  if (lang === "he") {
    const hebDays = ["יום ראשון", "יום שני", "יום שלישי", "יום רביעי", "יום חמישי", "יום שישי", "יום שבת"];
    const dayName = hebDays[dt.weekday % 7];
    return `${dayName} ${dt.toFormat("dd/LL")} ${dt.toFormat("HH:mm")} — ${summary}`;
  }
  if (lang === "ru") return `${dt.setLocale("ru").toFormat("ccc dd/LL HH:mm")} — ${summary}`;
  return `${dt.setLocale("en").toFormat("ccc dd/LL HH:mm")} — ${summary}`;
}
