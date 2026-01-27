import { getOpenAIClient, OPENAI_MODEL } from "../openaiClient";

export type IntentResult = {
  intent: "schedule" | "cancel" | "reschedule" | "unknown";
  confidence: number; // 0..1
};

export async function extractActionIntent(userText: string): Promise<IntentResult> {
  const client = getOpenAIClient();

  const schema = {
    type: "object",
    additionalProperties: false,
    properties: {
      intent: { type: "string", enum: ["schedule", "cancel", "reschedule", "unknown"] },
      confidence: { type: "number" },
    },
    required: ["intent", "confidence"],
  } as const;

  const system =
    `You classify a user's intent for an appointment bot.\n` +
    `Return JSON only.\n\n` +
    `Intents:\n` +
    `- schedule: user wants to book/see available times (or mentions a date/time like "tomorrow morning")\n` +
    `- cancel: user wants to cancel an existing appointment\n` +
    `- reschedule: user wants to change/move an appointment\n` +
    `- unknown: not related\n\n` +
    `IMPORTANT:\n` +
    `- If the user message contains a date/time/weekday without saying "appointment", classify as schedule.\n`;

  const response = await client.responses.create({
    model: OPENAI_MODEL,
    input: [
      { role: "system", content: system },
      { role: "user", content: userText },
    ],
    text: {
      format: {
        type: "json_schema",
        name: "intent_result",
        strict: true,
        schema,
      },
    },
  });

  const jsonText = response.output_text?.trim();
  if (!jsonText) return { intent: "unknown", confidence: 0 };

  try {
    const parsed = JSON.parse(jsonText) as IntentResult;
    const conf = Math.max(0, Math.min(1, Number(parsed.confidence ?? 0)));
    return { intent: parsed.intent ?? "unknown", confidence: conf };
  } catch {
    return { intent: "unknown", confidence: 0 };
  }
}
