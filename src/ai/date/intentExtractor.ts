import OpenAI from "openai";
import { DateTime } from "luxon";

export type DateIntent = {
  language: "he" | "ru" | "en" | "unknown";
  date: string | null;
  time_preference: "morning" | "noon" | "afternoon" | "evening" | "any" | null;
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
  const todayIso = now.toISODate();
  const dow = now.weekday;

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
    `Return ONLY JSON matching the schema.\n\n` +
    `Rules:\n` +
    `- Resolve weekdays and "next weekday" into a concrete ISO date.\n` +
    `- If missing a real date -> needs_clarification=true, date=null.\n`;

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
