"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { GlobalNav } from "@/components/GlobalNav";
import { Footer } from "@/components/Footer";
import { DrawdownChart, type ChartAnnotation } from "@/components/DrawdownChart";
import { WatchButton } from "@/components/WatchButton";
import { TickerLogo } from "@/components/TickerLogo";
import {
  analyze,
  fmtDate,
  fmtDur,
  fmtMonth,
  median,
  money,
  pct,
  type SeriesPoint,
} from "@/lib/analyze";
import type { QuoteSeries } from "@/lib/quotes";

const RANGES = ["YTD", "1Y", "3Y", "5Y", "10Y", "Max"] as const;
const DAY_MS = 86400000;
const MIN_DEPTH_PCT = 10;
const SIMILAR_BAND_PCT = 12;
const MIN_POINTS = 60;
const NEG = "#bf3a2c";
const POS = "#1a7f4b";

type Status = "loading" | "error" | "ready";

export function AnalyzeClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const ticker = (searchParams.get("ticker") || "").toUpperCase();

  const [status, setStatus] = useState<Status>("loading");
  const [errorMsg, setErrorMsg] = useState("");
  const [quote, setQuote] = useState<QuoteSeries | null>(null);
  const [tab, setTab] = useState<"underwater" | "price">("underwater");

  const [range, setRangeState] = useState<string>(searchParams.get("range") || "Max");
  const [start, setStart] = useState<string>(searchParams.get("start") || "");
  const [end, setEnd] = useState<string>(searchParams.get("end") || "");

  useEffect(() => {
    if (!ticker) {
      setStatus("error");
      setErrorMsg("No ticker given.");
      return;
    }
    let cancelled = false;
    setStatus("loading");
    fetch(`/api/series?ticker=${encodeURIComponent(ticker)}`)
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.error || "Failed to load price data.");
        return body as QuoteSeries;
      })
      .then((data) => {
        if (cancelled) return;
        setQuote(data);
        setStatus("ready");
      })
      .catch((err: Error) => {
        if (cancelled) return;
        setErrorMsg(err.message);
        setStatus("error");
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticker]);

  const fullSeries: SeriesPoint[] = useMemo(() => {
    if (!quote) return [];
    return quote.points.map((p) => ({ ms: Date.parse(p.t), p: p.c }));
  }, [quote]);

  function pushUrl(nextRange: string, nextStart: string, nextEnd: string) {
    const params = new URLSearchParams({ ticker });
    params.set("range", nextRange);
    if (nextRange === "Custom" && nextStart && nextEnd) {
      params.set("start", nextStart);
      params.set("end", nextEnd);
    }
    router.replace(`/analyze?${params.toString()}`, { scroll: false });
  }

  function setRange(r: string) {
    setRangeState(r);
    setStart("");
    setEnd("");
    pushUrl(r, "", "");
  }

  function onStartChange(v: string) {
    setStart(v);
    setRangeState("Custom");
    pushUrl("Custom", v, end);
  }
  function onEndChange(v: string) {
    setEnd(v);
    setRangeState("Custom");
    pushUrl("Custom", start, v);
  }

  const bounds = useMemo(() => {
    if (!fullSeries.length) return null;
    const lastMs = fullSeries[fullSeries.length - 1].ms;
    if (range === "Custom" && start && end) {
      return { a: Date.parse(start), b: Date.parse(end) };
    }
    if (range === "YTD") {
      const jan1 = Date.UTC(new Date(lastMs).getUTCFullYear(), 0, 1);
      return { a: jan1, b: lastMs };
    }
    const yrs = ({ "1Y": 1, "3Y": 3, "5Y": 5, "10Y": 10 } as Record<string, number>)[range];
    return { a: yrs ? lastMs - yrs * 365.25 * DAY_MS : fullSeries[0].ms, b: lastMs };
  }, [fullSeries, range, start, end]);

  const viewSeries = useMemo(() => {
    if (!bounds) return [];
    return fullSeries.filter((d) => d.ms >= bounds.a && d.ms <= bounds.b);
  }, [fullSeries, bounds]);

  const insufficientData = status === "ready" && viewSeries.length < MIN_POINTS;

  const vm = useMemo(() => {
    if (!quote || viewSeries.length < MIN_POINTS) return null;
    const currency = quote.currency;
    const A = analyze(viewSeries, MIN_DEPTH_PCT);
    const n = viewSeries.length;
    const last = viewSeries[n - 1];
    const m = A.main;
    const recovered = m.recIdx != null;
    const recoveredPct = Math.max(
      0,
      Math.min(100, Math.round(((last.p - m.troughPrice) / (m.peakPrice - m.troughPrice)) * 100))
    );
    const underwaterDays = Math.round((last.ms - viewSeries[m.peakIdx].ms) / DAY_MS);

    const fullA = analyze(fullSeries, MIN_DEPTH_PCT);
    const threshold = Math.max(MIN_DEPTH_PCT, Math.abs(m.depth) * 100 - SIMILAR_BAND_PCT);
    const similar = fullA.episodes.filter((e) => Math.abs(e.depth) * 100 >= threshold);
    const simRec = similar.filter((e) => e.recIdx != null);
    const medRec = median(simRec.map((e) => e.recDays as number));
    const maxRec = simRec.length ? Math.max(...simRec.map((e) => e.recDays as number)) : null;

    const annotations: ChartAnnotation[] = [];
    if (tab === "price") annotations.push({ i: m.peakIdx, label: "Peak " + money(m.peakPrice, currency), color: "#1d1d1f", up: true });
    annotations.push({ i: m.troughIdx, label: "Trough " + pct(m.depth), color: NEG, up: false });
    if (recovered) annotations.push({ i: m.recIdx as number, label: "Recovered", color: POS, up: true });

    const histBuckets: { lo: number; hi: number; label: string; count: number }[] = [];
    const edges = [MIN_DEPTH_PCT, 20, 30, 40, 50, 60];
    for (let k = 0; k < edges.length; k++) {
      const lo = edges[k];
      const hiE = k === edges.length - 1 ? 200 : edges[k + 1];
      if (lo >= hiE) continue;
      histBuckets.push({ lo, hi: hiE, label: k === edges.length - 1 ? lo + "+" : `${lo}–${hiE}`, count: 0 });
    }
    A.episodes.forEach((e) => {
      const d = Math.abs(e.depth) * 100;
      for (const b of histBuckets) {
        if (d >= b.lo && d < b.hi) {
          b.count++;
          break;
        }
      }
    });
    const maxCount = Math.max(1, ...histBuckets.map((b) => b.count));
    const curDepth = Math.abs(m.depth) * 100;
    let currentBucketLabel = histBuckets[histBuckets.length - 1]?.label ?? "";
    histBuckets.forEach((b) => {
      if (curDepth >= b.lo && curDepth < b.hi) currentBucketLabel = b.label;
    });
    const histogram = histBuckets.map((b, k) => {
      const active = curDepth >= b.lo && curDepth < b.hi;
      return {
        label: b.label,
        count: b.count,
        h: Math.round((b.count / maxCount) * 168),
        fill: b.count === 0 ? "#f5f5f7" : `rgba(191,58,44,${(0.28 + 0.12 * k).toFixed(2)})`,
        border: active ? `2px solid ${NEG}` : "2px solid transparent",
        countColor: active ? NEG : "#7a7a7a",
      };
    });

    const episodes = [...A.episodes]
      .sort((a, b) => a.depth - b.depth)
      .map((e) => ({
        peak: fmtDate(viewSeries[e.peakIdx].ms),
        trough: fmtDate(viewSeries[e.troughIdx].ms),
        depth: pct(e.depth),
        fall: fmtDur(e.fallDays),
        recovery: e.recIdx == null ? "—" : fmtDur(e.recDays),
        status: e.recIdx == null ? "Underwater" : "Recovered",
        statusColor: e.recIdx == null ? NEG : POS,
      }));

    return {
      currency,
      last,
      m,
      recovered,
      recoveredPct,
      underwaterDays,
      A,
      similar,
      simRec,
      medRec,
      maxRec,
      threshold,
      annotations,
      histogram,
      currentBucketLabel,
      episodes,
    };
  }, [quote, viewSeries, fullSeries, tab]);

  if (status === "loading") {
    return (
      <>
        <GlobalNav />
        <main className="flex-1 bg-parchment flex items-center justify-center">
          <div className="text-center max-w-[420px] px-6">
            <div className="type-display-md">{ticker || "…"}</div>
            <div className="type-body text-ink-muted-80 mt-2">Computing running peak and drawdown episodes.</div>
            <div className="mt-8 h-[3px] bg-hairline rounded-pill overflow-hidden relative">
              <div className="absolute inset-y-0 w-1/4 bg-primary rounded-pill animate-[dd-sweep_900ms_ease-in-out_infinite]" />
            </div>
          </div>
        </main>
        <Footer />
      </>
    );
  }

  if (status === "error" || insufficientData || !vm) {
    return (
      <>
        <GlobalNav />
        <main className="flex-1 bg-parchment flex items-center justify-center">
          <div className="max-w-[520px] px-6 text-center">
            <div className="type-display-lg">No data for that range.</div>
            <p className="type-body text-ink-muted-80 mt-4 mb-8 text-pretty">
              {status === "error"
                ? errorMsg || "A drawdown needs at least a few months of closes. Widen the date range or pick a different ticker."
                : "A drawdown needs at least a few months of closes. Widen the date range or pick a different ticker."}
            </p>
            <Link
              href="/"
              className="inline-block h-11 px-7 rounded-pill bg-primary text-on-primary type-body leading-[44px] active:scale-95 transition-transform"
            >
              Start over
            </Link>
          </div>
        </main>
        <Footer />
      </>
    );
  }

  const { currency, last, m, recovered, recoveredPct, underwaterDays, A, similar, simRec, medRec, maxRec, threshold, annotations, histogram, currentBucketLabel, episodes } = vm;
  const n = viewSeries.length;
  const rangeLabel = `${range === "Custom" ? "Custom range" : range} · ${fmtMonth(viewSeries[0].ms)} – ${fmtMonth(last.ms)}`;

  return (
    <>
      <GlobalNav />

      <div className="sticky top-0 z-30 border-b border-hairline backdrop-blur-xl" style={{ background: "rgba(245,245,247,0.8)" }}>
        <div className="max-w-[1440px] mx-auto px-6 min-h-[52px] flex items-center gap-6 flex-wrap">
          <div className="flex items-baseline gap-2.5 py-2">
            <span className="type-tagline">{ticker}</span>
            <span className="type-caption text-ink-muted-48">{quote?.name}</span>
          </div>
          <div className="ml-auto flex items-center gap-2 flex-wrap py-2">
            {RANGES.map((r) => (
              <button
                key={r}
                onClick={() => setRange(r)}
                className="type-caption h-8 px-3.5 rounded-pill border cursor-pointer"
                style={
                  range === r
                    ? { background: "var(--color-primary)", color: "#fff", borderColor: "var(--color-primary)" }
                    : { background: "var(--color-canvas)", color: "var(--color-ink)", borderColor: "var(--color-hairline)" }
                }
              >
                {r}
              </button>
            ))}
            <span className="w-px h-6 bg-hairline mx-1" />
            <input
              type="date"
              value={start || (bounds ? new Date(bounds.a).toISOString().slice(0, 10) : "")}
              onChange={(e) => onStartChange(e.target.value)}
              className="type-caption h-8 px-3.5 rounded-pill border border-hairline bg-canvas outline-none"
            />
            <span className="type-caption text-ink-muted-48">&rarr;</span>
            <input
              type="date"
              value={end || (bounds ? new Date(bounds.b).toISOString().slice(0, 10) : "")}
              onChange={(e) => onEndChange(e.target.value)}
              className="type-caption h-8 px-3.5 rounded-pill border border-hairline bg-canvas outline-none"
            />
            <WatchButton ticker={ticker} />
            <Link
              href="/"
              className="type-caption h-8 px-4 rounded-pill bg-primary text-white ml-1 flex items-center"
            >
              New analysis
            </Link>
          </div>
        </div>
      </div>

      <main className="animate-[dd-fade_240ms_ease-out]">
        <section className="bg-canvas border-b border-divider-soft">
          <div className="max-w-[1440px] mx-auto px-6 pt-10 pb-8 flex items-end gap-8 flex-wrap">
            <div className="flex items-center gap-4 flex-1 min-w-[300px]">
              <TickerLogo ticker={ticker} size={56} fontSize={18} />
              <div className="min-w-0">
                <div className="type-display-md text-[28px]! leading-tight truncate">{quote?.name}</div>
                <div className="type-caption text-ink-muted-48 mt-1.5">
                  {quote?.exchange} &middot; {rangeLabel} &middot; {n.toLocaleString()} daily closes
                </div>
              </div>
            </div>
            <div className="ml-auto flex items-end gap-8">
              <div>
                <div className="type-caption text-ink-muted-48">Last close</div>
                <div className="type-display-md text-[34px]! leading-tight">{money(last.p, currency)}</div>
              </div>
              <div className="pb-1.5">
                <span
                  className="inline-block px-3.5 py-1.5 rounded-pill type-caption-strong"
                  style={{ background: recovered ? "var(--color-positive-soft)" : "var(--color-negative-soft)", color: recovered ? POS : NEG }}
                >
                  {recovered ? "Recovered" : "Still underwater"}
                </span>
              </div>
            </div>
          </div>
        </section>

        <section className="bg-parchment">
          <div className="max-w-[1440px] mx-auto px-6 py-8">
            <div className="bg-canvas border border-hairline rounded-lg p-6 grid gap-8 gap-x-10" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(228px,1fr))" }}>
              <div>
                <div className="type-caption text-ink-muted-48">Maximum drawdown</div>
                <div className="type-hero-display mt-1" style={{ color: NEG }}>{pct(m.depth)}</div>
                <div className="type-caption text-ink-muted-80 mt-2">
                  Peak {fmtDate(viewSeries[m.peakIdx].ms)} at {money(m.peakPrice, currency)} &rarr; trough {fmtDate(viewSeries[m.troughIdx].ms)} at {money(m.troughPrice, currency)}
                </div>
              </div>
              <div>
                <div className="type-caption text-ink-muted-48">Decline lasted</div>
                <div className="type-lead text-[28px]! mt-1.5">{fmtDur(m.fallDays)}</div>
                <div className="type-caption text-ink-muted-48 mt-2">{m.fallDays.toLocaleString()} days peak to trough</div>
              </div>
              <div>
                <div className="type-caption text-ink-muted-48">{recovered ? "Time to recover" : "Underwater for"}</div>
                <div className="type-lead text-[28px]! mt-1.5" style={{ color: recovered ? POS : NEG }}>
                  {recovered ? fmtDur(m.recDays) : fmtDur(underwaterDays)}
                </div>
                <div className="type-caption text-ink-muted-48 mt-2">
                  {recovered ? `New high on ${fmtDate(viewSeries[m.recIdx as number].ms)}` : `and counting, as of ${fmtDate(last.ms)}`}
                </div>
              </div>
              <div>
                <div className="type-caption text-ink-muted-48">Below peak today</div>
                <div className="type-lead text-[28px]! mt-1.5" style={{ color: A.currentDD <= -0.0005 ? NEG : POS }}>
                  {A.currentDD <= -0.0005 ? pct(A.currentDD) : "At high"}
                </div>
                <div className="type-caption text-ink-muted-48 mt-2">Running peak {money(A.runningPeak, currency)}</div>
              </div>
            </div>
          </div>
        </section>

        <section className="bg-parchment">
          <div className="max-w-[1440px] mx-auto px-6 pb-8 grid gap-6 items-start" style={{ gridTemplateColumns: "minmax(0,2.3fr) minmax(300px,1fr)" }}>
            <div className="bg-canvas border border-hairline rounded-lg p-6">
              <div className="flex items-start gap-6 flex-wrap mb-5">
                <div>
                  <div className="type-tagline">{tab === "underwater" ? "Underwater curve" : "Price with drawdown marks"}</div>
                  <div className="type-caption text-ink-muted-48 mt-1">
                    {tab === "underwater" ? "Percent below the running peak, daily." : "Log scale. Peak, trough and recovery marked."}
                  </div>
                </div>
                <div className="ml-auto flex gap-2">
                  <button
                    onClick={() => setTab("underwater")}
                    className="type-caption h-8 px-4 rounded-pill border cursor-pointer"
                    style={tab === "underwater" ? { background: "var(--color-ink)", color: "#fff", borderColor: "var(--color-ink)" } : { background: "#fff", color: "var(--color-ink)", borderColor: "var(--color-hairline)" }}
                  >
                    Underwater
                  </button>
                  <button
                    onClick={() => setTab("price")}
                    className="type-caption h-8 px-4 rounded-pill border cursor-pointer"
                    style={tab === "price" ? { background: "var(--color-ink)", color: "#fff", borderColor: "var(--color-ink)" } : { background: "#fff", color: "var(--color-ink)", borderColor: "var(--color-hairline)" }}
                  >
                    Price
                  </button>
                </div>
              </div>

              <DrawdownChart series={viewSeries} dd={A.dd} tab={tab} annotations={annotations} currency={currency} />

              <div className="flex gap-6 flex-wrap mt-5 pt-4 border-t border-divider-soft">
                <span className="type-micro-legal text-ink-muted-48">
                  {tab === "underwater"
                    ? "Zero means the price is making a new high. The shaded depth is the pain an investor was holding through."
                    : "Dashed verticals mark the peak, trough and recovery of the deepest decline in range."}
                </span>
              </div>
            </div>

            <div className="grid gap-6">
              <div className="bg-canvas border border-hairline rounded-lg p-6">
                <div className="type-tagline">Position vs peak</div>
                <div className="type-caption text-ink-muted-48 mt-1">Where the price sits between the trough and the prior high.</div>

                <div className="flex items-baseline gap-2 mt-5">
                  <span className="type-display-lg" style={{ color: recoveredPct >= 100 ? POS : recoveredPct >= 50 ? "var(--color-primary)" : NEG }}>
                    {recoveredPct}%
                  </span>
                  <span className="type-caption text-ink-muted-48">of the loss recovered</span>
                </div>

                <div className="mt-5">
                  <div className="relative h-3 rounded-pill bg-parchment border border-hairline overflow-hidden">
                    <div
                      className="absolute inset-y-0 left-0 rounded-pill"
                      style={{ width: `${recoveredPct}%`, background: recoveredPct >= 100 ? POS : recoveredPct >= 50 ? "var(--color-primary)" : NEG }}
                    />
                  </div>
                  <div className="flex justify-between mt-2 type-caption text-ink-muted-48">
                    <span>Trough {money(m.troughPrice, currency)}</span>
                    <span>Peak {money(m.peakPrice, currency)}</span>
                  </div>
                </div>

                <div className="mt-6">
                  {[
                    { k: "Prior peak", v: money(m.peakPrice, currency), color: "var(--color-ink)" },
                    { k: "Trough", v: money(m.troughPrice, currency), color: NEG },
                    { k: "Last close", v: money(last.p, currency), color: "var(--color-ink)" },
                    { k: "Gain needed to reclaim peak", v: recovered ? "—" : pct(m.peakPrice / last.p - 1), color: recovered ? "var(--color-ink-muted-48)" : POS },
                  ].map((row) => (
                    <div key={row.k} className="flex justify-between items-baseline py-2.5 border-t border-divider-soft">
                      <span className="type-caption text-ink-muted-48">{row.k}</span>
                      <span className="type-body-strong tabular-nums" style={{ color: row.color }}>{row.v}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-canvas border border-hairline rounded-lg p-6">
                <div className="type-tagline">Historical recovery</div>
                <div className="type-caption text-ink-muted-48 mt-1">
                  Declines of {Math.round(threshold)}% or deeper across the full record since {new Date(fullSeries[0].ms).getUTCFullYear()}.
                </div>

                <div className="flex items-baseline gap-2 mt-5">
                  <span className="type-display-lg whitespace-nowrap" style={{ color: POS }}>
                    {simRec.length} of {similar.length}
                  </span>
                  <span className="type-caption text-ink-muted-48">came back to the old high</span>
                </div>

                <div className="mt-6">
                  {[
                    { k: "Comparable drawdowns", v: String(similar.length) },
                    { k: "Recovered to prior high", v: String(simRec.length) },
                    { k: "Median time to recover", v: fmtDur(medRec) },
                    { k: "Longest recovery", v: fmtDur(maxRec) },
                  ].map((row) => (
                    <div key={row.k} className="flex justify-between items-baseline py-2.5 border-t border-divider-soft">
                      <span className="type-caption text-ink-muted-48">{row.k}</span>
                      <span className="type-body-strong tabular-nums">{row.v}</span>
                    </div>
                  ))}
                </div>

                <div className="type-micro-legal text-ink-muted-48 mt-4 pt-4 border-t border-divider-soft">
                  Past behaviour of this stock only. Not a forecast.
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="bg-canvas">
          <div className="max-w-[1440px] mx-auto px-6 pt-12 pb-16 grid gap-6 items-start" style={{ gridTemplateColumns: "minmax(320px,1fr) minmax(0,1.6fr)" }}>
            <div>
              <div className="type-display-md">How deep, how often</div>
              <p className="type-body text-ink-muted-80 mt-3 max-w-[44ch] text-pretty">
                Every distinct decline of {MIN_DEPTH_PCT}% or more in the selected range, grouped by depth. The deepest decline in this range sits in the {currentBucketLabel} band.
              </p>

              <div className="mt-8 flex items-end gap-3" style={{ height: 200 }}>
                {histogram.map((b) => (
                  <div key={b.label} className="flex-1 flex flex-col items-center justify-end h-full gap-2">
                    <span className="type-caption-strong" style={{ color: b.countColor }}>{b.count}</span>
                    <div className="w-full rounded-t-sm" style={{ background: b.fill, height: Math.max(2, b.h), border: b.border }} />
                  </div>
                ))}
              </div>
              <div className="flex gap-3 mt-2 pt-2 border-t border-hairline">
                {histogram.map((b) => (
                  <div key={b.label} className="flex-1 text-center type-caption text-ink-muted-48 whitespace-nowrap">
                    {b.label}
                  </div>
                ))}
              </div>
              <div className="type-caption text-ink-muted-48 mt-4">Episode count by peak-to-trough depth, in percent.</div>
            </div>

            <div className="border border-hairline rounded-lg overflow-hidden">
              <div className="px-6 py-5 border-b border-hairline flex items-baseline gap-3 flex-wrap">
                <span className="type-tagline">Drawdown history</span>
                <span className="type-caption text-ink-muted-48 ml-auto">{episodes.length} episodes &middot; deepest first</span>
              </div>
              <div className="max-h-[440px] overflow-auto">
                <table className="w-full border-collapse tabular-nums">
                  <thead>
                    <tr className="sticky top-0 bg-pearl">
                      <th className="text-left px-6 py-3 type-caption-strong text-ink-muted-48 border-b border-hairline">Peak</th>
                      <th className="text-left px-3 py-3 type-caption-strong text-ink-muted-48 border-b border-hairline">Trough</th>
                      <th className="text-right px-3 py-3 type-caption-strong text-ink-muted-48 border-b border-hairline">Depth</th>
                      <th className="text-right px-3 py-3 type-caption-strong text-ink-muted-48 border-b border-hairline">Fall</th>
                      <th className="text-right px-3 py-3 type-caption-strong text-ink-muted-48 border-b border-hairline">Recovery</th>
                      <th className="text-right px-6 py-3 type-caption-strong text-ink-muted-48 border-b border-hairline">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {episodes.map((ep, idx) => (
                      <tr key={idx}>
                        <td className="px-6 py-3.5 type-caption border-b border-divider-soft whitespace-nowrap">{ep.peak}</td>
                        <td className="px-3 py-3.5 type-caption border-b border-divider-soft whitespace-nowrap text-ink-muted-80">{ep.trough}</td>
                        <td className="px-3 py-3.5 type-caption-strong border-b border-divider-soft text-right" style={{ color: NEG }}>{ep.depth}</td>
                        <td className="px-3 py-3.5 type-caption border-b border-divider-soft text-right text-ink-muted-80 whitespace-nowrap">{ep.fall}</td>
                        <td className="px-3 py-3.5 type-caption border-b border-divider-soft text-right text-ink-muted-80 whitespace-nowrap">{ep.recovery}</td>
                        <td className="px-6 py-3.5 type-caption-strong border-b border-divider-soft text-right whitespace-nowrap" style={{ color: ep.statusColor }}>{ep.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </>
  );
}
