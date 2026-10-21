"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { GlobalNav } from "@/components/GlobalNav";
import { Footer } from "@/components/Footer";
import { DrawdownChart, type ChartItem } from "@/components/DrawdownChart";
import { RecoveryChart } from "@/components/RecoveryChart";
import { WatchButton } from "@/components/WatchButton";
import { WatchlistBar } from "@/components/WatchlistBar";
import { TickerLogo } from "@/components/TickerLogo";
import {
  analyzeTicker,
  currentDrawdown,
  daysBetween,
  fmtDate,
  fmtDays,
  fmtNum,
  fmtPct,
  fmtPrice,
  fmtYm,
  isoDate,
  type SeriesPoint,
  type TickerAnalysis,
} from "@/lib/analyze";
import type { LiveQuote, QuoteSeries } from "@/lib/quotes";
import { normalizeTicker } from "@/lib/ticker";

const RANGES = ["YTD", "1Y", "3Y", "5Y", "10Y", "Max"] as const;
const DEFAULT_RANGE = "5Y";
const DEFAULT_TICKER = "SPY";
const MIN_DATE = "1980-01-01";
const DAY_MS = 86400000;
const NEG = "#bf3a2c";
const POS = "#1a7f4b";
// Ticker A keeps the app's Action Blue; B is an orange validated against it
// for colour-vision separation and contrast on the white canvas.
const COLORS = ["#0066cc", "#c2620a"];

type Loaded<T> =
  | { status: "loading" }
  | { status: "ready"; data: T }
  | { status: "error"; notFound: boolean; message: string };

async function getJson<T>(url: string): Promise<Loaded<T>> {
  try {
    const res = await fetch(url);
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { status: "error", notFound: res.status === 404, message: body.error || `Request failed (${res.status}).` };
    }
    return { status: "ready", data: body as T };
  } catch (err) {
    return { status: "error", notFound: false, message: (err as Error).message };
  }
}

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Spec defaults: end = today, start = today − 365 × years. */
function presetBounds(range: string, today: string): { start: string; end: string } {
  if (range === "Max") return { start: MIN_DATE, end: today };
  if (range === "YTD") return { start: today.slice(0, 4) + "-01-01", end: today };
  const years = ({ "1Y": 1, "3Y": 3, "5Y": 5, "10Y": 10 } as Record<string, number>)[range] ?? 5;
  return { start: isoDate(Date.parse(today) - years * 365 * DAY_MS), end: today };
}

function slice(points: QuoteSeries["points"], start: string, end: string): SeriesPoint[] {
  // ISO dates compare correctly as strings, so no parsing until we keep a point.
  return points.filter((p) => p.t >= start && p.t <= end).map((p) => ({ ms: Date.parse(p.t), p: p.c }));
}

type Prepared = {
  ticker: string;
  color: string;
  info: QuoteSeries;
  series: SeriesPoint[];
  analysis: TickerAnalysis;
  quote: Loaded<LiveQuote>;
};

export function AnalyzeClient() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // An absent ?ticker= means first load (spec default SPY); a present-but-empty
  // one means the user cleared the field, which gets the "enter a ticker" note.
  const tickerParam = searchParams.get("ticker");
  const ticker = normalizeTicker(tickerParam ?? DEFAULT_TICKER);
  const vs = normalizeTicker(searchParams.get("vs") ?? "");
  const range = searchParams.get("range") || DEFAULT_RANGE;

  const today = todayIso();
  const { start, end } =
    range === "Custom"
      ? { start: searchParams.get("start") || presetBounds(DEFAULT_RANGE, today).start, end: searchParams.get("end") || today }
      : presetBounds(range, today);

  const compareRequested = vs !== "" && vs !== ticker;

  const [runId, setRunId] = useState(0);
  // A ticker with no entry yet reads as loading. On a re-run the previous
  // result stays up until the fresh one replaces it.
  const [series, setSeries] = useState<Record<string, Loaded<QuoteSeries>>>({});
  const [quotes, setQuotes] = useState<Record<string, Loaded<LiveQuote>>>({});

  useEffect(() => {
    const wanted = [ticker, compareRequested ? vs : ""].filter(Boolean);
    for (const t of wanted) {
      // Results are keyed by ticker, so a slow response landing after the
      // user has moved on just fills the cache rather than clobbering anything.
      getJson<QuoteSeries>(`/api/series?ticker=${encodeURIComponent(t)}`).then((r) =>
        setSeries((prev) => ({ ...prev, [t]: r }))
      );
      getJson<LiveQuote>(`/api/quote?ticker=${encodeURIComponent(t)}`).then((r) =>
        setQuotes((prev) => ({ ...prev, [t]: r }))
      );
    }
  }, [ticker, vs, compareRequested, runId]);

  function navigate(next: { ticker?: string; vs?: string; range?: string; start?: string; end?: string }) {
    const params = new URLSearchParams();
    params.set("ticker", next.ticker ?? ticker);
    const nextVs = next.vs ?? vs;
    if (nextVs) params.set("vs", nextVs);
    const nextRange = next.range ?? range;
    params.set("range", nextRange);
    if (nextRange === "Custom") {
      params.set("start", next.start ?? start);
      params.set("end", next.end ?? end);
    }
    router.replace(`/analyze?${params.toString()}`, { scroll: false });
  }

  function run(nextTicker: string, nextVs: string) {
    navigate({ ticker: normalizeTicker(nextTicker), vs: normalizeTicker(nextVs) });
    setRunId((n) => n + 1);
  }

  // ---- Resolve what to show (spec §2 validation, in order) ----
  const view = useMemo(() => {
    type View =
      | { kind: "message"; tone: "error" | "info"; text: string }
      | { kind: "loading" }
      | { kind: "ready"; items: Prepared[]; warning: string | null };

    if (start >= end) return { kind: "message", tone: "error", text: "Start date must be earlier than end date." } as View;
    if (!ticker) return { kind: "message", tone: "info", text: "Enter a ticker above, or pick one from your watchlist." } as View;

    const noData = (t: string) =>
      `No valid data found for “${t}”. Check the ticker symbol and the date range.`;

    const prepare = (t: string, k: number): Prepared | "loading" | { notFound: true } | { error: string } => {
      const s = series[t];
      if (!s || s.status === "loading") return "loading";
      if (s.status === "error") return s.notFound ? { notFound: true } : { error: s.message };
      const view = slice(s.data.points, start, end);
      if (view.length < 2) return { notFound: true };
      return { ticker: t, color: COLORS[k], info: s.data, series: view, analysis: analyzeTicker(view), quote: quotes[t] ?? { status: "loading" } };
    };

    const a = prepare(ticker, 0);
    if (a === "loading") return { kind: "loading" } as View;
    if ("notFound" in a) return { kind: "message", tone: "error", text: noData(ticker) } as View;
    if ("error" in a) return { kind: "message", tone: "error", text: `Couldn't load data: ${a.error}` } as View;

    if (!compareRequested) return { kind: "ready", items: [a], warning: null } as View;

    const b = prepare(vs, 1);
    if (b === "loading") return { kind: "loading" } as View;
    if ("error" in b) return { kind: "message", tone: "error", text: `Couldn't load data: ${b.error}` } as View;
    if ("notFound" in b) {
      return {
        kind: "ready",
        items: [a],
        warning: `Couldn't find data for comparison ticker “${vs}”, so only ${ticker} is shown.`,
      } as View;
    }
    return { kind: "ready", items: [a, b], warning: null } as View;
  }, [series, quotes, ticker, vs, compareRequested, start, end]);

  const pillStyle = (on: boolean) =>
    on
      ? { background: "var(--color-primary)", color: "#fff", borderColor: "var(--color-primary)" }
      : { background: "var(--color-canvas)", color: "var(--color-ink)", borderColor: "var(--color-hairline)" };

  return (
    <>
      <GlobalNav />

      <div className="sticky top-0 z-30 border-b border-hairline backdrop-blur-xl" style={{ background: "rgba(245,245,247,0.8)" }}>
        <div className="max-w-[1440px] mx-auto px-6 py-2 flex items-center gap-x-6 gap-y-2 flex-wrap">
          {/* Keyed on the URL tickers so the fields reset when they change
              underneath (watchlist taps, back/forward). */}
          <TickerForm key={`${ticker}|${vs}`} ticker={ticker} vs={vs} onRun={run} />

          <div className="ml-auto flex items-center gap-2 flex-wrap">
            {RANGES.map((r) => (
              <button
                key={r}
                onClick={() => navigate({ range: r })}
                className="type-caption h-8 px-3.5 rounded-pill border cursor-pointer"
                style={pillStyle(range === r)}
              >
                {r}
              </button>
            ))}
            <span className="w-px h-6 bg-hairline mx-1" />
            <input
              type="date"
              value={start}
              min={MIN_DATE}
              max={today}
              aria-label="Start date"
              onChange={(e) => e.target.value && navigate({ range: "Custom", start: e.target.value })}
              className="type-caption h-8 px-3.5 rounded-pill border border-hairline bg-canvas outline-none"
            />
            <span className="type-caption text-ink-muted-48">&rarr;</span>
            <input
              type="date"
              value={end}
              min={MIN_DATE}
              max={today}
              aria-label="End date"
              onChange={(e) => e.target.value && navigate({ range: "Custom", end: e.target.value })}
              className="type-caption h-8 px-3.5 rounded-pill border border-hairline bg-canvas outline-none"
            />
            {ticker && <WatchButton ticker={ticker} />}
          </div>
        </div>
      </div>

      <div className="bg-canvas border-b border-divider-soft">
        <div className="max-w-[1440px] mx-auto px-6 py-3">
          <WatchlistBar active={ticker} onSelect={(t) => navigate({ ticker: t })} />
        </div>
      </div>

      {view.kind === "loading" && (
        <main className="flex-1 bg-parchment flex items-center justify-center py-24">
          <div className="text-center max-w-[420px] px-6">
            <div className="type-display-md">{compareRequested ? `${ticker} vs ${vs}` : ticker}</div>
            <div className="type-body text-ink-muted-80 mt-2">Computing running peak and drawdown episodes.</div>
            <div className="mt-8 h-[3px] bg-hairline rounded-pill overflow-hidden relative">
              <div className="absolute inset-y-0 w-1/4 bg-primary rounded-pill animate-[dd-sweep_900ms_ease-in-out_infinite]" />
            </div>
          </div>
        </main>
      )}

      {view.kind === "message" && (
        <main className="flex-1 bg-parchment">
          <div className="max-w-[720px] mx-auto px-6 py-16">
            <div className="bg-canvas border border-hairline rounded-lg p-8">
              <p className="type-body text-pretty" style={{ color: view.tone === "error" ? NEG : "var(--color-ink-muted-80)" }}>
                {view.text}
              </p>
            </div>
          </div>
        </main>
      )}

      {view.kind === "ready" && <Results items={view.items} warning={view.warning} />}

      <Footer />
    </>
  );
}

function TickerForm({ ticker, vs, onRun }: { ticker: string; vs: string; onRun: (ticker: string, vs: string) => void }) {
  const [tickerDraft, setTickerDraft] = useState(ticker);
  const [vsDraft, setVsDraft] = useState(vs);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onRun(tickerDraft, vsDraft);
      }}
      className="flex items-center gap-2 flex-wrap"
    >
      <input
        type="text"
        value={tickerDraft}
        onChange={(e) => setTickerDraft(e.target.value)}
        placeholder="Ticker, e.g. SPY"
        aria-label="Ticker"
        autoComplete="off"
        className="type-caption-strong h-8 w-32 px-3.5 rounded-pill border border-hairline bg-canvas outline-none focus-visible:border-primary"
      />
      <span className="type-caption text-ink-muted-48">vs</span>
      <input
        type="text"
        value={vsDraft}
        onChange={(e) => setVsDraft(e.target.value)}
        placeholder="Compare (optional)"
        aria-label="Comparison ticker"
        autoComplete="off"
        className="type-caption h-8 w-40 px-3.5 rounded-pill border border-hairline bg-canvas outline-none focus-visible:border-primary"
      />
      <button type="submit" className="type-caption h-8 px-4 rounded-pill bg-primary text-white cursor-pointer active:scale-95 transition-transform">
        Analyze
      </button>
    </form>
  );
}

function Results({ items, warning }: { items: Prepared[]; warning: string | null }) {
  const compare = items.length > 1;
  // minmax(0,1fr) columns, so wide tables scroll inside their card instead of
  // stretching the grid track (and the whole page) past a phone's width.
  const cols = compare ? "grid gap-6 grid-cols-1 lg:grid-cols-2" : "grid gap-6 grid-cols-1";

  const chartItems: ChartItem[] = useMemo(
    () => items.map((it) => ({ ticker: it.ticker, color: it.color, series: it.series, mdd: it.analysis.mdd })),
    [items]
  );
  const anyEpisodes = items.some((it) => it.analysis.episodes.length > 0);

  return (
    <main className="animate-[dd-fade_240ms_ease-out]">
      {warning && (
        <div className="bg-parchment">
          <div className="max-w-[1440px] mx-auto px-6 pt-6">
            <div className="bg-canvas border border-hairline rounded-lg px-5 py-3.5 type-caption text-ink-muted-80">{warning}</div>
          </div>
        </div>
      )}

      <section className="bg-canvas border-b border-divider-soft">
        <div className={`max-w-[1440px] mx-auto px-6 pt-10 pb-8 ${cols}`}>
          {items.map((it) => (
            <TickerHeader key={it.ticker} item={it} compare={compare} />
          ))}
        </div>
      </section>

      <section className="bg-parchment">
        <div className={`max-w-[1440px] mx-auto px-6 py-8 ${cols}`}>
          {items.map((it) => (
            <StatCards key={it.ticker} item={it} compare={compare} />
          ))}
        </div>
      </section>

      <section className="bg-parchment">
        <div className="max-w-[1440px] mx-auto px-6 pb-8">
          <div className="bg-canvas border border-hairline rounded-lg p-6">
            <div className="type-tagline">Price and drawdown</div>
            <div className="type-caption text-ink-muted-48 mt-1 mb-5">
              {compare
                ? "Each ticker is indexed to 100 on its own first date in range. Below, the percent each sits under its running peak."
                : "Adjusted close against its running peak (dashed); the shaded gap is time spent below the prior high."}
            </div>
            <DrawdownChart items={chartItems} />
          </div>
        </div>
      </section>

      <section className="bg-parchment">
        <div className={`max-w-[1440px] mx-auto px-6 pb-8 ${cols}`}>
          {items.map((it) => (
            <EpisodesTable key={it.ticker} item={it} compare={compare} />
          ))}
        </div>
      </section>

      <section className="bg-canvas">
        <div className="max-w-[1440px] mx-auto px-6 pt-12 pb-16">
          <div className="type-display-md">Average recovery time by drawdown depth</div>
          <p className="type-body text-ink-muted-80 mt-3 max-w-[70ch] text-pretty">
            Drawdowns are grouped into 5-point bands by depth. Each bar is the average number of days a drawdown in
            that band took to climb from its trough back to the prior peak. Drawdowns that haven&apos;t recovered
            yet are left out of the average.
          </p>
          <div className="mt-8">
            {anyEpisodes ? (
              <RecoveryChart groups={items.map((it) => ({ ticker: it.ticker, color: it.color, buckets: it.analysis.buckets }))} />
            ) : (
              <p className="type-body text-ink-muted-48">No drawdowns to show.</p>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}

function Swatch({ color }: { color: string }) {
  return <span className="inline-block w-2.5 h-2.5 rounded-full shrink-0" style={{ background: color }} />;
}

function TickerHeader({ item, compare }: { item: Prepared; compare: boolean }) {
  const { ticker, info, series, quote } = item;
  const q = quote.status === "ready" ? quote.data : null;
  const change = q && q.prev != null ? q.last - q.prev : null;
  const changePct = change != null && q?.prev ? (change / q.prev) * 100 : null;
  const up = change != null && change >= 0;

  return (
    <div className={compare ? "" : "flex items-end gap-8 flex-wrap"}>
      <div className="flex items-center gap-4 flex-1 min-w-[280px]">
        <TickerLogo ticker={ticker} size={56} fontSize={14} />
        <div className="min-w-0">
          <div className="type-display-md text-[28px]! leading-tight truncate">{info.name}</div>
          <div className="type-caption text-ink-muted-48 mt-1.5 flex items-center gap-1.5">
            {compare && <Swatch color={item.color} />}
            <span className="type-caption-strong text-ink">{ticker}</span>
            {info.exchange && <> &middot; {info.exchange}</>} &middot; {series.length.toLocaleString("en-US")} daily closes
          </div>
        </div>
      </div>

      {/* md: only — once the row wraps on a phone, ml-auto would push the
          price block to the right edge instead of under the name. */}
      <div className={compare ? "mt-6" : "md:ml-auto"}>
        {quote.status === "loading" ? (
          <div className="type-caption text-ink-muted-48">Loading live price…</div>
        ) : !q ? (
          <div className="type-caption text-ink-muted-80">Couldn&apos;t load the current price.</div>
        ) : (
          <>
            <div className="flex items-baseline gap-3 flex-wrap">
              <span className="type-display-md text-[34px]! leading-tight tabular-nums">{fmtPrice(q.last)}</span>
              <span className="type-caption text-ink-muted-48">{q.currency}</span>
              {change != null && (
                <span className="type-body-strong tabular-nums" style={{ color: up ? POS : NEG }}>
                  {up ? "▲" : "▼"} {fmtNum(Math.abs(change), 2)} ({fmtPct(changePct, true)})
                </span>
              )}
            </div>
            <div className="flex gap-x-6 gap-y-2 flex-wrap mt-3">
              {[
                { k: "PER", v: fmtNum(q.trailingPE, 2) },
                { k: "Fwd PER", v: fmtNum(q.forwardPE, 2) },
                { k: "EPS", v: fmtNum(q.eps, 2) },
                { k: "Dividend yield", v: q.dividendYield == null ? "—" : q.dividendYield.toFixed(2) + "%" },
              ].map((f) => (
                <div key={f.k}>
                  <div className="type-caption text-ink-muted-48">{f.k}</div>
                  <div className="type-body-strong tabular-nums">{f.v}</div>
                </div>
              ))}
            </div>
            <div className="type-micro-legal text-ink-muted-48 mt-3">Live price · refreshed at most once a minute</div>
          </>
        )}
      </div>
    </div>
  );
}

function StatCards({ item, compare }: { item: Prepared; compare: boolean }) {
  const { series, analysis, quote } = item;
  const { mdd } = analysis;
  const last = series.length - 1;
  const live = quote.status === "ready" ? quote.data.last : null;
  const cur = currentDrawdown(series, mdd.runningMax, live);
  const recovered = mdd.recoveryIdx != null;

  const cards: { label: string; value: string; sub: string; color?: string; badge?: { text: string; ok: boolean } }[] = [
    { label: "Maximum drawdown (MDD)", value: fmtPct(mdd.mdd), sub: "Largest decline from a prior peak", color: NEG },
    {
      label: "Current drawdown",
      value: cur.atHigh ? "0.00%" : fmtPct(cur.value),
      sub: `${cur.basis} · ${cur.atHigh ? "at or near the range high" : "below the range high"}`,
      color: cur.atHigh ? POS : NEG,
    },
    { label: "Peak", value: fmtDate(series[mdd.peakIdx].ms), sub: fmtPrice(mdd.peakVal) },
    { label: "Trough", value: fmtDate(series[mdd.troughIdx].ms), sub: fmtPrice(series[mdd.troughIdx].p) },
    { label: "Decline length", value: fmtDays(daysBetween(series, mdd.peakIdx, mdd.troughIdx)), sub: "Peak → trough" },
    recovered
      ? {
          label: "Recovery",
          badge: { text: "Recovered", ok: true },
          value: fmtDate(series[mdd.recoveryIdx as number].ms),
          sub: `${fmtDays(daysBetween(series, mdd.troughIdx, mdd.recoveryIdx as number))} to regain the prior peak`,
        }
      : {
          label: "Recovery",
          badge: { text: "Not recovered", ok: false },
          value: "Ongoing",
          sub: `${fmtDays(daysBetween(series, mdd.troughIdx, last))} since the trough, still below the peak`,
        },
    {
      label: "Analysis period",
      value: `${fmtYm(series[0].ms)} – ${fmtYm(series[last].ms)}`,
      sub: `${series.length.toLocaleString("en-US")} trading days`,
    },
  ];

  return (
    <div className="bg-canvas border border-hairline rounded-lg p-6">
      {compare && (
        <div className="flex items-center gap-2 type-tagline mb-5">
          <Swatch color={item.color} />
          {item.ticker}
        </div>
      )}
      <div
        className="grid gap-8 gap-x-10"
        // 260px in single mode is what the hero-sized MDD figure needs; any
        // narrower and it spills into the next column at laptop widths.
        style={{ gridTemplateColumns: `repeat(auto-fit,minmax(${compare ? 160 : 260}px,1fr))` }}
      >
        {cards.map((c, i) => (
          <div key={c.label}>
            <div className="type-caption text-ink-muted-48 flex items-center gap-2">
              {c.label}
              {c.badge && (
                <span
                  className="inline-block px-2.5 py-0.5 rounded-pill type-fine-print font-semibold"
                  style={{
                    background: c.badge.ok ? "var(--color-positive-soft)" : "var(--color-negative-soft)",
                    color: c.badge.ok ? POS : NEG,
                  }}
                >
                  {c.badge.text}
                </span>
              )}
            </div>
            <div
              className={`${i === 0 && !compare ? "type-hero-display" : compare ? "type-lead text-[24px]! whitespace-nowrap" : "type-lead text-[28px]!"} mt-1.5 tabular-nums`}
              style={c.color ? { color: c.color } : undefined}
            >
              {c.value}
            </div>
            <div className="type-caption text-ink-muted-48 mt-2">{c.sub}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function EpisodesTable({ item, compare }: { item: Prepared; compare: boolean }) {
  const { series, analysis } = item;
  const top = analysis.episodes.slice(0, 5);
  // Two tables side by side only just fit eight columns, so compare mode
  // tightens the gutters rather than hiding the Status column off-scroll.
  const px = compare ? "px-2" : "px-3";
  const th = "py-3 type-caption-strong text-ink-muted-48 border-b border-hairline whitespace-nowrap";
  const td = "py-3.5 type-caption border-b border-divider-soft whitespace-nowrap";

  return (
    <div className="bg-canvas border border-hairline rounded-lg overflow-hidden">
      <div className="px-6 py-5 border-b border-hairline flex items-center gap-2.5 flex-wrap">
        {compare && <Swatch color={item.color} />}
        <span className="type-tagline">
          {compare ? `${item.ticker} · ` : ""}Largest drawdowns
        </span>
        <span className="type-caption text-ink-muted-48 ml-auto">Top {compare ? 5 : top.length} by depth</span>
      </div>
      {top.length === 0 ? (
        <p className="px-6 py-8 type-body text-ink-muted-48">No drawdowns to show.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse tabular-nums">
            <thead>
              <tr className="bg-pearl">
                <th className={`${th} text-left pl-6 pr-2`}>#</th>
                <th className={`${th} text-left ${px}`}>Peak</th>
                <th className={`${th} text-left ${px}`}>Trough</th>
                <th className={`${th} text-right ${px}`}>Depth</th>
                <th className={`${th} text-right ${px}`}>Decline</th>
                <th className={`${th} text-left ${px}`}>Recovered on</th>
                <th className={`${th} text-right ${px}`}>Recovery</th>
                <th className={`${th} text-right pl-2 pr-6`}>Status</th>
              </tr>
            </thead>
            <tbody>
              {top.map((e, idx) => {
                const rec = e.recoveryIdx != null;
                const first = idx === 0;
                return (
                  <tr key={e.peakIdx} className={first ? "bg-pearl" : ""}>
                    <td className={`${td} pl-6 pr-2 ${first ? "font-semibold" : "text-ink-muted-48"}`}>{idx + 1}</td>
                    <td className={`${td} ${px} ${first ? "font-semibold" : ""}`}>{fmtDate(series[e.peakIdx].ms)}</td>
                    <td className={`${td} ${px} ${first ? "font-semibold" : "text-ink-muted-80"}`}>{fmtDate(series[e.troughIdx].ms)}</td>
                    <td className={`${td} ${px} text-right font-semibold`} style={{ color: NEG }}>{fmtPct(e.depth)}</td>
                    <td className={`${td} ${px} text-right text-ink-muted-80`}>{fmtDays(daysBetween(series, e.peakIdx, e.troughIdx))}</td>
                    <td className={`${td} ${px} text-ink-muted-80`}>{rec ? fmtDate(series[e.recoveryIdx as number].ms) : "—"}</td>
                    <td className={`${td} ${px} text-right text-ink-muted-80`}>
                      {rec ? fmtDays(daysBetween(series, e.troughIdx, e.recoveryIdx as number)) : "—"}
                    </td>
                    <td className={`${td} pl-2 pr-6 text-right`}>
                      <span
                        className="inline-block px-2.5 py-0.5 rounded-pill type-fine-print font-semibold"
                        style={{ background: rec ? "var(--color-positive-soft)" : "var(--color-negative-soft)", color: rec ? POS : NEG }}
                      >
                        {rec ? "Recovered" : "Ongoing"}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
