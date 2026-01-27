function norm(t: string) {
  return t.trim().toLowerCase();
}

export function isMoreRequest(textRaw: string): boolean {
  const t = norm(textRaw);
  return t === "more" || t.includes("עוד") || t.includes("הבא");
}
