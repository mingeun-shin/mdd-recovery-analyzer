// Yahoo conventions: AAPL, BRK-B, BTC-USD, ^GSPC, GC=F.
export const TICKER_RE = /^[A-Z0-9.\-^=]{1,15}$/;

export function normalizeTicker(raw: string): string {
  return raw.trim().toUpperCase();
}

export function isValidTicker(raw: string): boolean {
  return TICKER_RE.test(normalizeTicker(raw));
}
