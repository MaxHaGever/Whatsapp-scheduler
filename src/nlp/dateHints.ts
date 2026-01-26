function norm(t: string) {
  return t.trim().toLowerCase();
}

export function looksLikeSchedulingRequest(textRaw: string): boolean {
  const t = norm(textRaw);

  // Hebrew quick hints
  const heHints = ["מחר", "מחרתיים", "היום", "בבוקר", "בערב", "אחהצ", "אחר הצהריים", "שבוע הבא", "ביום"];
  const heDays = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];

  // English hints
  const enHints = ["tomorrow", "today", "morning", "evening", "next", "week", "on "];
  const enDays = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];

  // Russian hints (basic)
  const ruHints = ["завтра", "сегодня", "утром", "вечером", "след", "недел"];
  const ruDays = ["понедель", "вторник", "сред", "четверг", "пятниц", "суббот", "воскрес"];

  // numeric date patterns
  const hasNumbers = /\d{1,2}[\/.-]\d{1,2}/.test(t); // 26/01 etc

  const matchAny = (arr: string[]) => arr.some((x) => t.includes(x));

  return (
    hasNumbers ||
    matchAny(heHints) ||
    matchAny(heDays) ||
    matchAny(enHints) ||
    matchAny(enDays) ||
    matchAny(ruHints) ||
    matchAny(ruDays)
  );
}

export function parseChoiceNumber(textRaw: string): number | null {
  const t = norm(textRaw);
  const n = Number(t);
  if (!Number.isFinite(n)) return null;
  return n;
}
