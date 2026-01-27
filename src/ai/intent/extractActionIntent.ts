import { getOpenAIClient, OPENAI_MODEL } from "../openaiClient";

export type ActionIntentResult = {
  intent: "schedule" | "cancel" | "reschedule" | "unknown";
  confidence: number; // 0..1
};

export async function extractActionIntent(userText: string): Promise<ActionIntentResult> {
  const client = getOpenAIClient();

  const schema = {
    type: "object",
    additionalProperties: false,
    properties: {
      intent: { type: "string", enum: ["schedule", "cancel", "reschedule", "unknown"] },
      confidence: { type: "number", minimum: 0, maximum: 1 },
    },
    required: ["intent", "confidence"],
  } as const;

  const system =
    `You classify the user's intent for an appointment scheduling chatbot.\n` +
    `User may write Hebrew/Russian/English.\n\n` +
    `INTENTS:\n` +
    `- schedule: user wants to book a NEW appointment\n` +
    `- cancel: user wants to cancel an EXISTING appointment\n` +
    `- reschedule: user wants to change/move an EXISTING appointment\n` +
    `- unknown: not clear\n\n` +
    `Return ONLY JSON matching the schema. No prose.\n`;

  const response = await client.responses.create({
    model: OPENAI_MODEL,
    input: [
      { role: "system", content: system },
      { role: "user", content: userText },
    ],
    text: {
      format: {
        type: "json_schema",
        name: "action_intent",
        strict: true,
        schema,
      },
    },
  });

  const jsonText = response.output_text?.trim();
  if (!jsonText) throw new Error("OpenAI returned empty output_text");

  return JSON.parse(jsonText) as ActionIntentResult;
}
