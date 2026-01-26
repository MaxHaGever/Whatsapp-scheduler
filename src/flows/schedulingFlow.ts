import { getOrCreateUserState, saveUserState } from "../services/state";
import { sendAndStoreTextMessage } from "../services/messageService";
import { calendarNotConnectedMessage } from "../messages/calendar.messages";
import { proposeSlotsForBusiness } from "../services/scheduling";

function isCalendarNotConnectedError(err: any): boolean {
  const msg = String(err?.message ?? "");
  return (
    msg.includes("No active calendar connection") ||
    msg.includes("Google refresh token missing") ||
    msg.includes("not connected")
  );
}

/**
 * Step 1 Scheduling Flow
 * - If calendar is not connected => send message and return safely
 * - If connected => propose slots (simple example for today)
 */
export async function runSchedulingFlow(args: {
  businessId: string;
  waId: string;
  text: string;
}) {
  const { businessId, waId } = args;

  const state = await getOrCreateUserState(waId);
  const lang = state.preferredLanguage;

  try {
    const timezone = process.env.DEFAULT_TZ || "Asia/Jerusalem";
    const todayIso = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

    const slots = await proposeSlotsForBusiness({
      businessId,
      dayIsoDate: todayIso,
      timezone,
      maxSlots: 3,
    });

    const msg =
      slots.length > 0
        ? `מצאתי תורים פנויים:\n${slots
            .map((s, i) => `${i + 1}) ${s.label}`)
            .join("\n")}\n\nהשיבו עם 1/2/3 כדי לבחור`
        : "לא מצאתי תורים פנויים היום. נסו תאריך אחר 🙂";

    await sendAndStoreTextMessage({
      businessId,
      waId,
      body: msg,
      meta: { reason: "slots-proposed-step1" },
    });

    await saveUserState(waId, { stage: "IDLE" });
    return;
  } catch (err: any) {
    // ✅ calendar not connected => friendly reply
    if (isCalendarNotConnectedError(err)) {
      await sendAndStoreTextMessage({
        businessId,
        waId,
        body: calendarNotConnectedMessage(lang),
        meta: { reason: "calendar-not-connected" },
      });

      await saveUserState(waId, { stage: "IDLE" });
      return;
    }

    console.error("[SCHEDULING_FLOW_ERROR]", err);

    await sendAndStoreTextMessage({
      businessId,
      waId,
      body: "⚠️ הייתה בעיה זמנית מול היומן. נסו שוב בעוד דקה.",
      meta: { reason: "calendar-provider-error" },
    });

    await saveUserState(waId, { stage: "IDLE" });
  }
}
