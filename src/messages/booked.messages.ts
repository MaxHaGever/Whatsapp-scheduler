import type { Lang } from "../services/state";

export function bookedMessage(lang: Lang, label: string): string {
  if (lang === "ru") return `✅ Записано: ${label}`;
  if (lang === "en") return `✅ Booked: ${label}`;
  return `✅ נקבע: ${label}`;
}
