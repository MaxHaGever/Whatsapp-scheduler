import { getOpenAIClient, OPENAI_MODEL } from "../openaiClient";

export type TopIntent = {
  intent: "schedule" | "cancel" | "reschedule" | "unknown";
  confidence: number; // 0..1
  language: "he" | "ru" | "en" | "unknown";
};

export async function extractTopIntent(userText: string): Promise<TopIntent> {
  const client = getOpenAIClient();

  const schema = {
    type: "object",
    additionalProperties: false,
    properties: {
      intent: { type: "string", enum: ["schedule", "cancel", "reschedule", "unknown"] },
      confidence: { type: "number" },
      language: { type: "string", enum: ["he", "ru", "en", "unknown"] },
    },
    required: ["intent", "confidence", "language"],
  } as const;

  const system =
    `You classify the user's top intent for appointment management.\n` +
    `Possible intents:\n` +
    `- schedule: user wants to book/make an appointment\n` +
    `- cancel: user wants to cancel an appointment\n` +
    `- reschedule: user wants to move/change an existing appointment\n` +
    `- unknown: unclear\n\n` +
    `Return ONLY JSON that matches the schema. No prose.\n` +
    `confidence must be between 0 and 1.\n\n` +
    `Hebrew examples:\n` +
    `- "אני רוצה לקבוע תור" => schedule\n` +
    `- "לבטל תור" => cancel\n` +
    `- "לשנות תור" / "לדחות" / "להקדים" => reschedule\n\n` +
    `English examples:\n` +
    `- "book an appointment" => schedule\n` +
    `- "cancel my appointment" => cancel\n` +
    `- "move my appointment" => reschedule\n`;

  const resp = await client.responses.create({
    model: OPENAI_MODEL,
    input: [
      { role: "system", content: system },
      { role: "user", content: userText },
    ],
    text: {
      format: { type: "json_schema", name: "top_intent", strict: true, schema },
    },
  });

  const jsonText = resp.output_text?.trim();
  if (!jsonText) throw new Error("OpenAI returned empty output_text");

  const parsed = JSON.parse(jsonText) as TopIntent;

  const c = Number(parsed.confidence);
  parsed.confidence = Number.isFinite(c) ? Math.max(0, Math.min(1, c)) : 0;

  return parsed;
}
