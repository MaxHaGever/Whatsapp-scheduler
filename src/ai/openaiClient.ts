import OpenAI from "openai";

export function getOpenAIClient() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("Missing OPENAI_API_KEY in env");
  }
  return new OpenAI({ apiKey });
}

export const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";
export const AI_TIMEZONE = process.env.AI_TIMEZONE || "Asia/Jerusalem";
