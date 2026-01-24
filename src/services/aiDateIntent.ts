import axios from "axios";

const TZ = "Asia/Jerusalem";

export type DateIntent =
  | { ok: true; kind: "single_day"; date: string } // YYYY-MM-DD in TZ
  | { ok: true; kind: "range"; start: string; end: string } // ISO
  | { ok: false; reason: "needs_clarification" | "failed" };

export async function extractDateIntent(text: string): Promise<DateIntent> {
  const apiKey = process.env.AI_API_KEY;
  const baseUrl = process.env.AI_BASE_URL; // e.g. https://api.<provider>.com/v1
  const model = process.env.AI_MODEL;

  if (!apiKey || !baseUrl || !model) {
    // no AI configured yet
    return { ok: false, reason: "failed" };
  }

  const system = [
    "You extract scheduling intent from user messages.",
    "User may write Hebrew or Russian.",
    `Timezone is ${TZ}. Today is ${new Date().toISOString()}.`,
    "Return ONLY valid JSON. No prose.",
    "If user asks for a specific day (e.g. 'ראשון הבא'), return kind=single_day with YYYY-MM-DD.",
    "If user asks for a range (e.g. 'השבוע'), return kind=range with ISO start/end.",
    "If unclear, return {ok:false, reason:'needs_clarification'}."
  ].join(" ");

  const user = `TEXT:\n${text}\n\nReturn JSON only.`;

  try {
    const resp = await axios.post(
      `${baseUrl}/chat/completions`,
      {
        model,
        temperature: 0,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user }
        ]
      },
      { headers: { Authorization: `Bearer ${apiKey}` } }
    );

    const content: string = resp.data?.choices?.[0]?.message?.content ?? "";
    const jsonStart = content.indexOf("{");
    const jsonEnd = content.lastIndexOf("}");
    if (jsonStart === -1 || jsonEnd === -1) return { ok: false, reason: "failed" };

    const parsed = JSON.parse(content.slice(jsonStart, jsonEnd + 1));
    return parsed as DateIntent;
  } catch {
    return { ok: false, reason: "failed" };
  }
}
