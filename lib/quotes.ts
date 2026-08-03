export type QuotePoint = { t: string; c: number };

export type QuoteSeries = {
  ticker: string;
  name: string;
  exchange: string;
  currency: string;
  points: QuotePoint[];
};

export class QuoteError extends Error {}

const TICKER_RE = /^[A-Z0-9.\-^]{1,12}$/;

// Free plan: 800 requests/day, 8/minute, up to 5000 bars per request
// (~20 years of daily closes). No start/end filtering needed here — the
// app fetches once per ticker and slices ranges client-side.
const OUTPUT_SIZE = 5000;

type TwelveDataValue = { datetime: string; close: string };
type TwelveDataResponse = {
  meta?: { symbol: string; exchange: string; currency: string; type: string };
  values?: TwelveDataValue[];
  status?: string;
  code?: number;
  message?: string;
};

/**
 * Fetches daily closes from Twelve Data's time_series endpoint (free tier,
 * API key required — https://twelvedata.com/pricing). Values already
 * reflect Twelve Data's own split/dividend adjustment for equities.
 */
export async function fetchSeries(rawTicker: string): Promise<QuoteSeries> {
  const ticker = rawTicker.trim().toUpperCase();
  if (!TICKER_RE.test(ticker)) {
    throw new QuoteError(`"${rawTicker}" doesn't look like a valid ticker.`);
  }

  const apiKey = process.env.TWELVE_DATA_API_KEY;
  if (!apiKey) {
    throw new QuoteError(
      "Server is missing TWELVE_DATA_API_KEY. Get a free key at twelvedata.com and add it to .env.local."
    );
  }

  const url =
    `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(ticker)}` +
    `&interval=1day&outputsize=${OUTPUT_SIZE}&order=ASC&apikey=${apiKey}`;

  let res: Response;
  try {
    res = await fetch(url, { cache: "no-store" });
  } catch {
    throw new QuoteError("Couldn't reach the price data provider. Try again in a moment.");
  }

  if (!res.ok) {
    throw new QuoteError(`Price data provider returned an error (${res.status}).`);
  }

  const json: TwelveDataResponse = await res.json();

  if (json.status === "error") {
    if (json.code === 429) {
      throw new QuoteError("Hit the price data provider's rate limit. Try again in a minute.");
    }
    throw new QuoteError(json.message || `No data found for "${ticker}".`);
  }

  const values = json.values;
  if (!values || !values.length) {
    throw new QuoteError(`No data found for "${ticker}".`);
  }

  const points: QuotePoint[] = [];
  let lastDate = "";
  for (const v of values) {
    const c = Number(v.close);
    if (!Number.isFinite(c)) continue;
    const date = v.datetime.slice(0, 10);
    if (date === lastDate) continue;
    lastDate = date;
    points.push({ t: date, c });
  }

  if (points.length < 20) {
    throw new QuoteError(`Not enough price history for "${ticker}" to analyze a drawdown.`);
  }

  return {
    ticker,
    name: json.meta?.symbol || ticker,
    exchange: json.meta?.exchange || "",
    currency: json.meta?.currency || "USD",
    points,
  };
}
