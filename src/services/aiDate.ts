import OpenAI from "openai";
import { DateTime } from "luxon";

export type DateIntent = {
  language: "he" | "ru" | "en" | "unknown";
  // ISO date in Asia/Jerusalem, e.g. "2026-01-28"
  date: string | null;

  // Optional time window preference (not required)
  time_preference: "morning" | "noon" | "afternoon" | "evening" | "any" | null;

  // If the user message is ambiguous, AI tells us to ask a follow-up
  needs_clarification: boolean;
  clarification_reason: string | null;
};

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";
const TZ = process.env.AI_TIMEZONE || "Asia/Jerusalem";

export async function extractDateIntent(userText: string): Promise<DateIntent> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("Missing OPENAI_API_KEY in env");
  }

  const now = DateTime.now().setZone(TZ);
  const today = now.toISODate(); // YYYY-MM-DD

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

  const response = await client.responses.create({
    model: MODEL,
    input: [
      {
        role: "system",
        content:
          `You extract scheduling date intent from user messages.\n` +
          `- User may write in Hebrew/Russian/English.\n` +
          `- Interpret relative dates in timezone ${TZ}.\n` +
          `- Today is ${today}.\n` +
          `- Output ONLY the JSON matching the schema.\n` +
          `Rules:\n` +
          `1) If the user asks for "next Sunday" / "בראשון הבא" etc, return the correct upcoming date.\n` +
          `2) If the user does NOT specify a day, set date=null and needs_clarification=true.\n` +
          `3) If the message is not about scheduling, date=null and needs_clarification=true.\n`,
      },
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

  // The SDK gives us the model output as text; since we forced JSON schema, it should parse cleanly.
  const jsonText = response.output_text?.trim();
  if (!jsonText) throw new Error("OpenAI returned empty output_text");

  let parsed: DateIntent;
  try {
    parsed = JSON.parse(jsonText) as DateIntent;
  } catch {
    throw new Error(`Failed to parse AI JSON: ${jsonText}`);
  }

  // Extra safety: validate ISO date shape quickly (optional)
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
