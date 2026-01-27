import { DateTime } from "luxon";
import {
  getOpenAIClient,
  OPENAI_MODEL,
  OPENAI_FALLBACK_MODEL,
  AI_TIMEZONE,
} from "../openaiClient";

export type DateIntent = {
  language: "he" | "ru" | "en" | "unknown";
  date: string | null; // YYYY-MM-DD
  time_preference: "morning" | "noon" | "afternoon" | "evening" | "any" | null;
  needs_clarification: boolean;
  clarification_reason: string | null;
  confidence: number; // 0..1
};

export type DateIntentContext = {
  /**
   * If the user is responding to proposed slots, this is the previously proposed day (YYYY-MM-DD).
   * Helps interpret "later", "not that day", "next day", "another day", etc.
   */
  referenceDateIso?: string | null;

  /**
   * Optional human-readable context you can give the model.
   * Example: "Previously we showed slots for 2026-01-27."
   */
  referenceNote?: string | null;

  /**
   * If you want the extractor to use a specific timezone. Defaults to AI_TIMEZONE.
   */
  timezone?: string;
};

async function callModelForDateIntent(args: {
  model: string;
  userText: string;
  ctx: DateIntentContext;
}): Promise<DateIntent> {
  const { model, userText, ctx } = args;
  const client = getOpenAIClient();

  const tz = ctx.timezone || AI_TIMEZONE;

  const now = DateTime.now().setZone(tz);
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
      confidence: { type: "number", minimum: 0, maximum: 1 },
    },
    required: [
      "language",
      "date",
      "time_preference",
      "needs_clarification",
      "clarification_reason",
      "confidence",
    ],
  } as const;

  const referenceDateLine =
    ctx.referenceDateIso
      ? `Reference date (previously proposed): ${ctx.referenceDateIso}.\n`
      : "";

  const referenceNoteLine =
    ctx.referenceNote ? `Reference note: ${ctx.referenceNote}\n` : "";

  const system =
    `You extract scheduling date intent from user messages.\n` +
    `User may write Hebrew/Russian/English.\n` +
    `Timezone: ${tz}.\n` +
    `Today is ${todayIso}. Current weekday number is ${dow} (1=Mon ... 7=Sun).\n` +
    referenceDateLine +
    referenceNoteLine +
    `\nReturn ONLY JSON matching the schema. No prose.\n\n` +
    `DATE RULES:\n` +
    `- Resolve weekdays to concrete dates (YYYY-MM-DD).\n` +
    `- "next <weekday>" / "בראשון הבא" => next occurrence strictly after today.\n` +
    `- Relative dates: today/tomorrow/next week etc.\n` +
    `- If referenceDateIso is provided and user says "later", "another day", "not that day", interpret relative to referenceDateIso.\n` +
    `\nCONFIDENCE RULES:\n` +
    `- confidence high (>=0.8) when user clearly specifies a date/weekday.\n` +
    `- confidence medium (0.5-0.79) when partially specified but reasonable.\n` +
    `- confidence low (<0.5) when ambiguous/vague.\n` +
    `\nCLARIFICATION:\n` +
    `- If no date/weekday can be confidently extracted => date=null and needs_clarification=true.\n`;

  const response = await client.responses.create({
    model,
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

  const parsed = JSON.parse(jsonText) as DateIntent;

  // Validate date
  if (parsed.date) {
    const dt = DateTime.fromISO(parsed.date, { zone: tz });
    if (!dt.isValid) {
      return {
        language: parsed.language ?? "unknown",
        date: null,
        time_preference: parsed.time_preference ?? null,
        needs_clarification: true,
        clarification_reason: "The extracted date was invalid.",
        confidence: Math.min(parsed.confidence ?? 0.3, 0.3),
      };
    }
  }

  // If it says it needs clarification, force low-ish confidence
  if (parsed.needs_clarification) {
    parsed.confidence = Math.min(parsed.confidence ?? 0.4, 0.49);
  }

  return parsed;
}

/**
 * Main function:
 * 1) try primary model
 * 2) if confidence low -> retry with fallback model
 */
export async function extractDateIntent(
  userText: string,
  ctx: DateIntentContext = {}
): Promise<DateIntent> {
  const threshold = Number(process.env.DATE_INTENT_CONFIDENCE_THRESHOLD ?? 0.65);

  const first = await callModelForDateIntent({
    model: OPENAI_MODEL,
    userText,
    ctx,
  });

  if (first.confidence >= threshold) return first;

  // Retry with fallback model (more expensive but better)
  const second = await callModelForDateIntent({
    model: OPENAI_FALLBACK_MODEL,
    userText,
    ctx,
  });

  // Return the better of the two (higher confidence)
  return second.confidence >= first.confidence ? second : first;
}
