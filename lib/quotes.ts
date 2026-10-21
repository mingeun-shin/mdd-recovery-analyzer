import { TICKER_RE } from "./ticker";
import { supabaseAdmin } from "./supabase/admin";

export type QuotePoint = { t: string; c: number };

export type QuoteSeries = {
  ticker: string;
  name: string;
  exchange: string;
  currency: string;
  points: QuotePoint[];
};

export type LiveQuote = {
  ticker: string;
  last: number;
  prev: number | null;
  currency: string;
  trailingPE: number | null;
  forwardPE: number | null;
  eps: number | null;
  dividendYield: number | null; // already in percent, e.g. 0.32 means 0.32%
};

export class QuoteError extends Error {
  constructor(message: string, readonly kind: "not-found" | "upstream" = "upstream") {
    super(message);
  }
}

// Yahoo Finance has no official public API. These are the same unauthenticated
// endpoints Yahoo's own site (and yfinance) call. There is no API key and no
// published quota, but Yahoo does throttle with HTTP 429 when one IP sends too
// much, so everything below sits behind caches.
//
// A bare "Mozilla/5.0" UA matters: Node's default UA gets through today, but a
// full Chrome UA string gets 429'd on sight — Yahoo checks it against the TLS
// fingerprint, and Node's doesn't look like Chrome's.
const YAHOO = "https://query2.finance.yahoo.com";
const UA = { "User-Agent": "Mozilla/5.0" };

// The spec's earliest selectable date. History is fetched once per ticker from
// here to today and sliced to the chosen range client-side, so the cache is one
// row per ticker rather than one per (ticker, start, end).
const HISTORY_START_S = Date.UTC(1980, 0, 1) / 1000;

// Two layers sit in front of Yahoo's chart endpoint:
//
//   L1  in-process Map — free, but dies with each serverless instance
//   L2  public.quote_series in Supabase — shared by every instance, so a
//       cold start costs a DB read rather than an upstream request
//
// In-flight de-dupe collapses concurrent requests for the same ticker (e.g.
// a watchlist rendering several rows) into a single L2 lookup and, at most,
// a single upstream call. 30 minutes matches the spec; the latest bar moves
// intraday, so this is a freshness/load trade-off rather than a daily one.
const SERIES_CACHE_TTL_MS = 30 * 60 * 1000;
const seriesCache = new Map<string, { data: QuoteSeries; expiresAt: number }>();
const seriesInflight = new Map<string, Promise<QuoteSeries>>();

function normalizeTicker(raw: string): string {
  const ticker = raw.trim().toUpperCase();
  if (!TICKER_RE.test(ticker)) {
    throw new QuoteError(`"${raw}" doesn't look like a valid ticker.`, "not-found");
  }
  return ticker;
}

/**
 * Daily split/dividend-adjusted closes (the spec's auto_adjust=True "Close")
 * from Yahoo's chart endpoint, 1980 to today.
 */
export async function fetchSeries(rawTicker: string): Promise<QuoteSeries> {
  const ticker = normalizeTicker(rawTicker);

  const cached = seriesCache.get(ticker);
  if (cached && cached.expiresAt > Date.now()) return cached.data;

  const pending = seriesInflight.get(ticker);
  if (pending) return pending;

  const promise = loadSeries(ticker)
    .then((data) => {
      seriesCache.set(ticker, { data, expiresAt: Date.now() + SERIES_CACHE_TTL_MS });
      return data;
    })
    .finally(() => seriesInflight.delete(ticker));
  seriesInflight.set(ticker, promise);
  return promise;
}

/** L2, then upstream. */
async function loadSeries(ticker: string): Promise<QuoteSeries> {
  const shared = await readSharedCache(ticker);
  if (shared) return shared;

  const fresh = await fetchSeriesUncached(ticker);
  // Deliberately not awaited: the caller already has its data, and a slow
  // write shouldn't sit on the response. Errors are swallowed inside.
  void writeSharedCache(fresh);
  return fresh;
}

type QuoteSeriesRow = {
  ticker: string;
  name: string;
  exchange: string;
  currency: string;
  points: QuotePoint[];
};

/**
 * Reads the shared cache, ignoring rows older than the TTL. Fails soft: a
 * Supabase outage falls through to Yahoo rather than taking the app down
 * with it. Uses the service-role client because this module is server-only
 * and holds no user session — quote_series is world-readable either way.
 */
async function readSharedCache(ticker: string): Promise<QuoteSeries | null> {
  const freshAfter = new Date(Date.now() - SERIES_CACHE_TTL_MS).toISOString();

  try {
    const { data, error } = await supabaseAdmin
      .from("quote_series")
      .select("ticker,name,exchange,currency,points")
      .eq("ticker", ticker)
      .gte("fetched_at", freshAfter)
      // An unreachable Supabase otherwise costs ~7 s of client retries before
      // we fall through — far slower than just asking Yahoo.
      .abortSignal(AbortSignal.timeout(2000))
      .maybeSingle<QuoteSeriesRow>();

    if (error || !data) return null;

    // points is jsonb, so its shape is only as good as whatever wrote it.
    if (!Array.isArray(data.points) || data.points.length < 2) return null;

    return {
      ticker: data.ticker,
      name: data.name,
      exchange: data.exchange,
      currency: data.currency,
      points: data.points,
    };
  } catch {
    return null;
  }
}

/**
 * Upserts a freshly fetched series. fetched_at is set explicitly because the
 * column default only applies on INSERT — leaving it off would let an updated
 * row keep its original timestamp and read as permanently stale.
 */
async function writeSharedCache(series: QuoteSeries): Promise<void> {
  try {
    const { error } = await supabaseAdmin.from("quote_series").upsert(
      {
        ticker: series.ticker,
        name: series.name,
        exchange: series.exchange,
        currency: series.currency,
        points: series.points,
        fetched_at: new Date().toISOString(),
      },
      { onConflict: "ticker" }
    );
    if (error) console.error(`quote_series upsert failed for ${series.ticker}:`, error.message);
  } catch (e) {
    console.error(`quote_series upsert threw for ${series.ticker}:`, e);
  }
}

type YahooChartResponse = {
  chart?: {
    result?: {
      meta: {
        currency?: string;
        longName?: string;
        shortName?: string;
        fullExchangeName?: string;
        gmtoffset?: number;
      };
      timestamp?: number[];
      indicators: {
        quote: { close: (number | null)[] }[];
        adjclose?: { adjclose: (number | null)[] }[];
      };
    }[];
    error?: { code: string; description: string } | null;
  };
};

function rateLimitError() {
  return new QuoteError("Yahoo Finance is rate-limiting requests right now (HTTP 429). Try again in a minute.");
}

async function fetchSeriesUncached(ticker: string): Promise<QuoteSeries> {
  const url =
    `${YAHOO}/v8/finance/chart/${encodeURIComponent(ticker)}` +
    `?period1=${HISTORY_START_S}&period2=${Math.floor(Date.now() / 1000)}` +
    `&interval=1d&events=div,split&includeAdjustedClose=true`;

  let res: Response;
  try {
    res = await fetch(url, { headers: UA, cache: "no-store" });
  } catch {
    throw new QuoteError("Couldn't reach Yahoo Finance. Try again in a moment.");
  }

  if (res.status === 429) throw rateLimitError();
  if (res.status === 404) throw new QuoteError(`No data found for "${ticker}".`, "not-found");
  if (!res.ok) throw new QuoteError(`Yahoo Finance returned an error (${res.status}).`);

  const json: YahooChartResponse = await res.json();
  const result = json.chart?.result?.[0];
  const timestamps = result?.timestamp;
  if (!result || !timestamps?.length) {
    throw new QuoteError(`No data found for "${ticker}".`, "not-found");
  }

  // Adjusted close where Yahoo provides it (equities/ETFs); indices and some
  // crypto pairs only have the raw close, which needs no adjusting anyway.
  const closes = result.indicators.adjclose?.[0]?.adjclose ?? result.indicators.quote[0]?.close ?? [];
  // Timestamps are the session open in UTC. Shifting by the exchange's offset
  // before taking the date keeps e.g. a KST morning session on the right day.
  const offsetMs = (result.meta.gmtoffset ?? 0) * 1000;

  // Spec §1: drop NaN closes, drop duplicate dates keeping the last, ascending.
  const byDate = new Map<string, number>();
  timestamps.forEach((ts, i) => {
    const c = closes[i];
    if (c == null || !Number.isFinite(c)) return;
    byDate.set(new Date(ts * 1000 + offsetMs).toISOString().slice(0, 10), c);
  });
  const points: QuotePoint[] = [...byDate.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([t, c]) => ({ t, c }));

  if (points.length < 2) {
    throw new QuoteError(`No data found for "${ticker}".`, "not-found");
  }

  return {
    ticker,
    name: result.meta.longName || result.meta.shortName || ticker,
    exchange: result.meta.fullExchangeName || "",
    currency: result.meta.currency || "USD",
    points,
  };
}

// ---------------------------------------------------------------------------
// Live quote + fundamentals
// ---------------------------------------------------------------------------

// The quote endpoint, unlike the chart one, wants a session cookie plus a
// matching "crumb" token. fc.yahoo.com hands out the cookie (on a 404, oddly),
// and getcrumb exchanges it for the token. Both are reusable for hours, so one
// pair per server instance; a 401 means it expired and is refetched once.
let session: Promise<{ cookie: string; crumb: string }> | null = null;

async function getSession() {
  if (!session) {
    session = (async () => {
      const r1 = await fetch("https://fc.yahoo.com", { headers: UA, redirect: "manual", cache: "no-store" });
      const cookie = r1.headers
        .getSetCookie()
        .map((c) => c.split(";")[0])
        .join("; ");
      if (!cookie) throw new QuoteError("Yahoo Finance didn't issue a session cookie.");

      const r2 = await fetch(`${YAHOO}/v1/test/getcrumb`, { headers: { ...UA, Cookie: cookie }, cache: "no-store" });
      if (r2.status === 429) throw rateLimitError();
      const crumb = (await r2.text()).trim();
      if (!r2.ok || !crumb || crumb.includes(" ")) {
        throw new QuoteError(`Couldn't get a Yahoo Finance session (${r2.status}).`);
      }
      return { cookie, crumb };
    })();
    // A failed handshake shouldn't be cached for the life of the instance.
    session.catch(() => (session = null));
  }
  return session;
}

type YahooQuoteRow = {
  symbol: string;
  regularMarketPrice?: number;
  regularMarketPreviousClose?: number;
  currency?: string;
  trailingPE?: number;
  forwardPE?: number;
  epsTrailingTwelveMonths?: number;
  dividendYield?: number;
};

// Spec: live quote cached ~60 s per ticker.
const QUOTE_CACHE_TTL_MS = 60 * 1000;
const quoteCache = new Map<string, { data: LiveQuote; expiresAt: number }>();
const quoteInflight = new Map<string, Promise<LiveQuote>>();

export async function fetchQuote(rawTicker: string): Promise<LiveQuote> {
  const ticker = normalizeTicker(rawTicker);

  const cached = quoteCache.get(ticker);
  if (cached && cached.expiresAt > Date.now()) return cached.data;

  const pending = quoteInflight.get(ticker);
  if (pending) return pending;

  const promise = fetchQuoteUncached(ticker)
    .then((data) => {
      quoteCache.set(ticker, { data, expiresAt: Date.now() + QUOTE_CACHE_TTL_MS });
      return data;
    })
    .finally(() => quoteInflight.delete(ticker));
  quoteInflight.set(ticker, promise);
  return promise;
}

async function fetchQuoteUncached(ticker: string, retried = false): Promise<LiveQuote> {
  const { cookie, crumb } = await getSession();
  const url = `${YAHOO}/v7/finance/quote?symbols=${encodeURIComponent(ticker)}&crumb=${encodeURIComponent(crumb)}`;

  let res: Response;
  try {
    res = await fetch(url, { headers: { ...UA, Cookie: cookie }, cache: "no-store" });
  } catch {
    throw new QuoteError("Couldn't reach Yahoo Finance. Try again in a moment.");
  }

  if ((res.status === 401 || res.status === 403) && !retried) {
    session = null;
    return fetchQuoteUncached(ticker, true);
  }
  if (res.status === 429) throw rateLimitError();
  if (!res.ok) throw new QuoteError(`Yahoo Finance returned an error (${res.status}).`);

  const json: { quoteResponse?: { result?: YahooQuoteRow[] } } = await res.json();
  const row = json.quoteResponse?.result?.[0];
  if (!row || row.regularMarketPrice == null) {
    throw new QuoteError(`No live quote for "${ticker}".`, "not-found");
  }

  const num = (v: number | undefined) => (v != null && Number.isFinite(v) ? v : null);
  return {
    ticker,
    last: row.regularMarketPrice,
    prev: num(row.regularMarketPreviousClose),
    currency: row.currency || "USD",
    trailingPE: num(row.trailingPE),
    forwardPE: num(row.forwardPE),
    eps: num(row.epsTrailingTwelveMonths),
    dividendYield: num(row.dividendYield),
  };
}

// ---------------------------------------------------------------------------
// Autocomplete
// ---------------------------------------------------------------------------

export type SymbolResult = { symbol: string; name: string; exchange: string };

type YahooSearchRow = {
  symbol?: string;
  shortname?: string;
  longname?: string;
  exchDisp?: string;
  quoteType?: string;
};

const SEARCHABLE_TYPES = new Set(["EQUITY", "ETF", "INDEX", "CRYPTOCURRENCY", "MUTUALFUND"]);

// Ticker/company-name mappings barely change, so cache aggressively — this
// endpoint is fired on every autocomplete keystroke (debounced client-side).
const SEARCH_CACHE_TTL_MS = 60 * 60 * 1000;
const searchCache = new Map<string, { data: SymbolResult[]; expiresAt: number }>();

/**
 * Autocomplete lookup via Yahoo's search endpoint. Fails soft (returns [])
 * rather than throwing — a broken autocomplete dropdown shouldn't block the
 * user from typing a ticker directly and submitting.
 */
export async function searchSymbols(rawQuery: string): Promise<SymbolResult[]> {
  const query = rawQuery.trim();
  if (!query) return [];

  const key = query.toLowerCase();
  const cached = searchCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.data;

  const url =
    `${YAHOO}/v1/finance/search?q=${encodeURIComponent(query)}` +
    `&quotesCount=10&newsCount=0&listsCount=0`;

  let res: Response;
  try {
    res = await fetch(url, { headers: UA, cache: "no-store" });
  } catch {
    return [];
  }
  if (!res.ok) return [];

  const json: { quotes?: YahooSearchRow[] } = await res.json().catch(() => ({}));
  const rows = Array.isArray(json.quotes) ? json.quotes : [];

  const results: SymbolResult[] = rows
    .filter((r) => r.symbol && (!r.quoteType || SEARCHABLE_TYPES.has(r.quoteType)))
    .slice(0, 8)
    .map((r) => ({
      symbol: r.symbol as string,
      name: r.longname || r.shortname || (r.symbol as string),
      exchange: r.exchDisp || "",
    }));

  searchCache.set(key, { data: results, expiresAt: Date.now() + SEARCH_CACHE_TTL_MS });
  return results;
}
