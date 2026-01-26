import { DateTime } from "luxon";
import { getOpenAIClient, OPENAI_MODEL, AI_TIMEZONE } from "./openaiClient";

export type DateIntent = {
  language: "he" | "ru" | "en" | "unknown";
  date: string | null; // YYYY-MM-DD
  time_preference: "morning" | "noon" | "afternoon" | "evening" | "any" | null;
  needs_clarification: boolean;
  clarification_reason: string | null;
};

export async function extractDateIntent(userText: string): Promise<DateIntent> {
  const client = getOpenAIClient();

  const now = DateTime.now().setZone(AI_TIMEZONE);
  const todayIso = now.toISODate();
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
    `Timezone: ${AI_TIMEZONE}.\n` +
    `Today is ${todayIso}. Current weekday number is ${dow} (1=Mon ... 7=Sun).\n\n` +
    `Return ONLY JSON matching the schema. No prose.\n\n` +
    `DATE RULES:\n` +
    `- Resolve weekdays to concrete dates.\n` +
    `- "next <weekday>" / "בראשון הבא" => next occurrence strictly after today.\n` +
    `- Relative dates: היום/מחר/מחרתיים.\n\n` +
    `TIME PREF:\n` +
    `- morning/noon/afternoon/evening/any if mentioned.\n` +
    `- else null.\n\n` +
    `CLARIFICATION:\n` +
    `- If no date/weekday => date=null and needs_clarification=true.\n`;

  const response = await client.responses.create({
    model: OPENAI_MODEL,
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

  // Validate date
  if (parsed.date) {
    const dt = DateTime.fromISO(parsed.date, { zone: AI_TIMEZONE });
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
