import { sendTextMessage } from "../services/whatsapp";
import { saveUserState } from "../services/state";
import { runSchedulingFlow } from "./schedulingFlow";

/**
 * Very simple "routing" while in IDLE:
 * - If user message looks like scheduling → move to AWAIT_DATE and run scheduling flow
 * - Else → send placeholder help text (not stored yet)
 */
export async function runIdleFlow(args: {
  businessId: string;
  waId: string;
  text: string;
}) {
  const { businessId, waId, text } = args;

  const t = text.trim().toLowerCase();

  // ✅ Minimal scheduling triggers (we can expand later)
  const looksLikeScheduling =
    t.includes("מחר") ||
    t.includes("היום") ||
    t.includes("תור") ||
    t.includes("appointment") ||
    t.includes("book") ||
    t.includes("schedule") ||
    t.includes("next") ||
    t.includes("tomorrow") ||
    t.includes("tuesday") ||
    t.includes("monday") ||
    t.includes("wednesday") ||
    t.includes("thursday") ||
    t.includes("friday") ||
    t.includes("saturday") ||
    t.includes("sunday");

  if (looksLikeScheduling) {
    // ✅ Move user to scheduling mode
    await saveUserState(waId, { stage: "AWAIT_DATE" });

    // ✅ Run scheduling flow (AI will run here)
    await runSchedulingFlow({ businessId, waId, text });
    return;
  }

  // ✅ Otherwise: placeholder response (NOT stored yet)
  await sendTextMessage(
    waId,
    "✅ תודה! כרגע אני רק בגרסת בסיס 🙂\nכדי לקבוע תור כתבו יום/תאריך כמו: מחר / בראשון הבא.\nאם רוצים להתחיל מחדש כתבו: reset"
  );
}
