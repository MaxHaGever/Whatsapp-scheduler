import OpenAI from "openai";
import { DateTime } from "luxon";

export type DateIntent = {
  language: "he" | "ru" | "en" | "unknown";

  // ISO date in timezone TZ, e.g. "2026-01-28"
  date: string | null;

  // Optional time window preference
  time_preference: "morning" | "noon" | "afternoon" | "evening" | "any" | null;

  // If ambiguous, AI tells us to ask a follow-up
  needs_clarification: boolean;
  clarification_reason: string | null;
};

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";
const TZ = process.env.AI_TIMEZONE || "Asia/Jerusalem";

export async function extractDateIntent(userText: string): Promise<DateIntent> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("Missing OPENAI_API_KEY in env");
  }

  const now = DateTime.now().setZone(TZ);
  const todayIso = now.toISODate(); // YYYY-MM-DD
  const dow = now.weekday; // 1=Mon ... 7=Sun

  const schema = {
    type: "object",
    additionalProperties: false,
    properties: {
      language: { type: "string", enum: ["he", "ru", "en", "unknown"] },
      date: { anyOf: [{ type: "string" }, { type: "null" }] },
      time_preference: {
        anyOf: [
          { type: "string", enum: ["morning", "noon", "afternoon", "evening", "any"] },
          { type: "null" },
        ],
      },
      needs_clarification: { type: "boolean" },
      clarification_reason: { anyOf: [{ type: "string" }, { type: "null" }] },
    },
    required: ["language", "date", "time_preference", "needs_clarification", "clarification_reason"],
  } as const;

  const system =
    `You extract scheduling date intent from user messages.\n` +
    `User may write Hebrew/Russian/English.\n` +
    `Timezone: ${TZ}.\n` +
    `Today is ${todayIso}. Current weekday number is ${dow} (1=Mon ... 7=Sun).\n\n` +
    `OUTPUT:\n` +
    `Return ONLY JSON matching the schema. No prose.\n\n` +
    `DATE RULES (IMPORTANT):\n` +
    `A) If the user mentions a weekday (e.g. Hebrew: ראשון/שני/שלישי/רביעי/חמישי/שישי/שבת,\n` +
    `   or Russian weekday words, or English weekday), you must resolve it to a concrete date.\n\n` +
    `B) If the user says "next <weekday>" (English) or "בראשון הבא" / "בחמישי הבא" (Hebrew) or "в следующий <день>" (Russian):\n` +
    `   - Return the NEXT occurrence of that weekday strictly after today.\n` +
    `   - If today is that weekday, "next" means 7 days later.\n\n` +
    `C) If the user says "שבוע הבא ביום <weekday>" (Hebrew) or "next week on <weekday>":\n` +
    `   - Interpret as the weekday in NEXT calendar week (not just the next occurrence).\n` +
    `   - Week starts Monday. Example: If today is Wed, "שבוע הבא ביום חמישי" refers to Thursday of NEXT week.\n\n` +
    `D) If the user says only "ביום חמישי" (Hebrew) / "on Thursday" (English) without "next week":\n` +
    `   - Interpret as the NEXT occurrence of that weekday (could be this week or next).\n\n` +
    `E) Relative dates:\n` +
    `   - "מחר" => tomorrow, "מחרתיים" => day after tomorrow.\n` +
    `   - "היום" => today.\n` +
    `   - "בסופ\"ש" / "סוף שבוע" => needs_clarification=true unless a specific day is implied.\n\n` +
    `TIME PREFERENCE RULES:\n` +
    `- If user mentions "בבוקר" => morning, "בצהריים" => noon, "אחר הצהריים" => afternoon, "בערב" => evening.\n` +
    `- Otherwise time_preference=null.\n\n` +
    `CLARIFICATION RULES:\n` +
    `1) If the user does NOT specify a day/date/weekday (e.g. "יש תורים?") set date=null and needs_clarification=true.\n` +
    `2) If message is not about scheduling, set date=null and needs_clarification=true.\n` +
    `3) If you resolve a weekday/date, needs_clarification=false.\n\n` +
    `LANGUAGE:\n` +
    `- Detect language: he/ru/en. If unclear => unknown.\n`;

  const response = await client.responses.create({
    model: MODEL,
    input: [
      { role: "system", content: system },
      { role: "user", content: userText },
    ],
    text: {
      format: {
        type: "json_schema",
        name: "date_intent",
        strict: true,
        schema,
      },
    },
  });

  const jsonText = response.output_text?.trim();
  if (!jsonText) throw new Error("OpenAI returned empty output_text");

  let parsed: DateIntent;
  try {
    parsed = JSON.parse(jsonText) as DateIntent;
  } catch {
    throw new Error(`Failed to parse AI JSON: ${jsonText}`);
  }

  if (parsed.date) {
    const dt = DateTime.fromISO(parsed.date, { zone: TZ });
    if (!dt.isValid) {
      return {
        language: parsed.language ?? "unknown",
        date: null,
        time_preference: parsed.time_preference ?? null,
        needs_clarification: true,
        clarification_reason: "The extracted date was invalid.",
      };
    }
  }

  return parsed;
}
