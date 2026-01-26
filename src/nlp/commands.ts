import type { Lang } from "../services/state";

export function normalizeText(t: string) {
  return t.trim().toLowerCase();
}

export function detectLanguageByKeyword(textRaw: string): Lang | null {
  const t = normalizeText(textRaw);
  if (t === "russian" || t === "ru") return "ru";
  if (t === "english" || t === "en") return "en";
  if (t === "עברית" || t === "hebrew" || t === "he") return "he";
  return null;
}

export function isCancelRequest(text: string) {
  const t = normalizeText(text);
  return t.includes("בטל") || t.includes("לבטל") || t.includes("cancel");
}

export function isListRequest(text: string) {
  const t = normalizeText(text);
  return t.includes("התורים") || t.includes("תורים שלי") || t.includes("my appointments");
}

export function isResetRequest(text: string) {
  const t = normalizeText(text);
  return t === "reset" || t === "איפוס" || t === "אפס";
}
