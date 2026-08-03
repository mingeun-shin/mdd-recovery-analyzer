export const TICKER_RE = /^[A-Z0-9.\-^]{1,12}$/;

export function isValidTicker(raw: string): boolean {
  return TICKER_RE.test(raw.trim().toUpperCase());
}
