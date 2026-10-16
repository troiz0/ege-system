export function stripFences(s: string): string {
  return s.trim().replace(/^\x60{3}(?:json)?\s*/i, '').replace(/\s*\x60{3}$/, '').trim();
}
export function safeParse(s: string): unknown {
  try { return JSON.parse(stripFences(s)); } catch { return undefined; }
}
