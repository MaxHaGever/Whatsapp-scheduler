import { getOpenAIClient, OPENAI_MODEL } from "../openaiClient";

export type TopLevelIntent = "schedule" | "cancel" | "reschedule" | "unknown";

export async function extractTopLevelIntent(text: string): Promise<{ intent: TopLevelIntent }> {
  const client = getOpenAIClient();

  const schema = {
    type: "object",
    additionalProperties: false,
    properties: {
      intent: { type: "string", enum: ["schedule", "cancel", "reschedule", "unknown"] },
    },
    required: ["intent"],
  } as const;

  const system =
    "Classify the user's intent for an appointment assistant.\n" +
    "Possible intents:\n" +
    "- schedule: user wants to book a new appointment\n" +
    "- cancel: user wants to cancel an existing appointment\n" +
    "- reschedule: user wants to move/change an existing appointment\n" +
    "- unknown: unclear\n" +
    "Return ONLY JSON matching the schema.";

  const response = await client.responses.create({
    model: OPENAI_MODEL,
    input: [
      { role: "system", content: system },
      { role: "user", content: text },
    ],
    text: {
      format: {
        type: "json_schema",
        name: "top_level_intent",
        strict: true,
        schema,
      },
    },
  });

  const jsonText = response.output_text?.trim();
  if (!jsonText) return { intent: "unknown" };

  try {
    return JSON.parse(jsonText) as { intent: TopLevelIntent };
  } catch {
    return { intent: "unknown" };
  }
}
