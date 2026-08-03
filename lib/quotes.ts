import { TICKER_RE } from "./ticker";

export type QuotePoint = { t: string; c: number };

export type QuoteSeries = {
  ticker: string;
  name: string;
  exchange: string;
  currency: string;
  points: QuotePoint[];
};

export class QuoteError extends Error {}

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

// Daily closes only change once a day, so there's no reason to spend the
// free tier's 8 req/min budget re-fetching the same ticker on every page
// view. Cached per server instance; in-flight de-dupe collapses concurrent
// requests for the same ticker (e.g. a watchlist rendering several rows)
// into a single upstream call.
const SERIES_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const seriesCache = new Map<string, { data: QuoteSeries; expiresAt: number }>();
const seriesInflight = new Map<string, Promise<QuoteSeries>>();

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

  const cached = seriesCache.get(ticker);
  if (cached && cached.expiresAt > Date.now()) return cached.data;

  const pending = seriesInflight.get(ticker);
  if (pending) return pending;

  const promise = fetchSeriesUncached(ticker)
    .then((data) => {
      seriesCache.set(ticker, { data, expiresAt: Date.now() + SERIES_CACHE_TTL_MS });
      return data;
    })
    .finally(() => seriesInflight.delete(ticker));
  seriesInflight.set(ticker, promise);
  return promise;
}

async function fetchSeriesUncached(ticker: string): Promise<QuoteSeries> {
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

export type SymbolResult = { symbol: string; name: string; exchange: string };

type TwelveDataSearchRow = {
  symbol: string;
  instrument_name?: string;
  exchange?: string;
  instrument_type?: string;
};

// Ticker/company-name mappings barely change, so cache aggressively — this
// endpoint is fired on every autocomplete keystroke (debounced client-side)
// and shares the same 8 req/min budget as fetchSeries.
const SEARCH_CACHE_TTL_MS = 60 * 60 * 1000;
const searchCache = new Map<string, { data: SymbolResult[]; expiresAt: number }>();

/**
 * Autocomplete lookup via Twelve Data's symbol_search endpoint. Fails soft
 * (returns []) rather than throwing — a broken autocomplete dropdown
 * shouldn't block the user from typing a ticker directly and submitting.
 */
export async function searchSymbols(rawQuery: string): Promise<SymbolResult[]> {
  const query = rawQuery.trim();
  if (!query) return [];

  const key = query.toLowerCase();
  const cached = searchCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.data;

  const apiKey = process.env.TWELVE_DATA_API_KEY;
  if (!apiKey) return [];

  const url = `https://api.twelvedata.com/symbol_search?symbol=${encodeURIComponent(query)}&apikey=${apiKey}`;

  let res: Response;
  try {
    res = await fetch(url, { cache: "no-store" });
  } catch {
    return [];
  }
  if (!res.ok) return [];

  const json: { data?: TwelveDataSearchRow[] } = await res.json().catch(() => ({}));
  const rows = Array.isArray(json.data) ? json.data : [];

  const results: SymbolResult[] = rows
    .filter((r) => !r.instrument_type || r.instrument_type === "Common Stock" || r.instrument_type === "ETF")
    .slice(0, 8)
    .map((r) => ({
      symbol: r.symbol,
      name: r.instrument_name || r.symbol,
      exchange: r.exchange || "",
    }));

  searchCache.set(key, { data: results, expiresAt: Date.now() + SEARCH_CACHE_TTL_MS });
  return results;
}
