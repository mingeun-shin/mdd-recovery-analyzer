"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { GlobalNav } from "@/components/GlobalNav";
import { Footer } from "@/components/Footer";
import { useWatchlist } from "@/lib/watchlist";
import { TickerLogo } from "@/components/TickerLogo";
import { analyze, money, pct, type SeriesPoint } from "@/lib/analyze";
import type { QuoteSeries } from "@/lib/quotes";

const NEG = "#bf3a2c";
const POS = "#1a7f4b";

// Twelve Data's free tier allows 8 req/min. A cold cache (see the TTL cache
// in lib/quotes.ts) plus a watchlist bigger than that would otherwise fire
// every row's request at once and start 429ing past the 6th or 7th ticker.
const BATCH_SIZE = 6;
const BATCH_DELAY_MS = 60_000;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type RowState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | {
      status: "ready";
      currency: string;
      last: number;
      currentDD: number;
      runningPeak: number;
    };

export default function WatchlistPage() {
  const { entries, remove } = useWatchlist();
  const [rows, setRows] = useState<Record<string, RowState>>({});

  useEffect(() => {
    const pending = entries.map((e) => e.ticker).filter((t) => !rows[t]);
    if (!pending.length) return;

    let cancelled = false;

    async function loadOne(t: string) {
      setRows((prev) => ({ ...prev, [t]: { status: "loading" } }));
      try {
        const res = await fetch(`/api/series?ticker=${encodeURIComponent(t)}`);
        const body = await res.json();
        if (!res.ok) throw new Error(body.error || "Failed to load.");
        const data = body as QuoteSeries;
        const series: SeriesPoint[] = data.points.map((p) => ({ ms: Date.parse(p.t), p: p.c }));
        const A = analyze(series, 10);
        if (cancelled) return;
        setRows((prev) => ({
          ...prev,
          [t]: {
            status: "ready",
            currency: data.currency,
            last: series[series.length - 1].p,
            currentDD: A.currentDD,
            runningPeak: A.runningPeak,
          },
        }));
      } catch (err) {
        if (cancelled) return;
        setRows((prev) => ({ ...prev, [t]: { status: "error", message: (err as Error).message } }));
      }
    }

    (async () => {
      for (let i = 0; i < pending.length; i += BATCH_SIZE) {
        if (cancelled) return;
        if (i > 0) await sleep(BATCH_DELAY_MS);
        await Promise.all(pending.slice(i, i + BATCH_SIZE).map(loadOne));
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries]);

  return (
    <>
      <GlobalNav />
      <main className="flex-1 bg-parchment">
        <div className="max-w-[1000px] mx-auto px-6 py-16">
          <div className="type-display-lg">Watchlist</div>
          <p className="type-body text-ink-muted-80 mt-3">
            Saved on this device only. Tap a ticker to open its full drawdown analysis.
          </p>

          {entries.length === 0 ? (
            <div className="mt-10 bg-canvas border border-hairline rounded-lg p-10 text-center">
              <p className="type-body text-ink-muted-80">Nothing saved yet.</p>
              <Link
                href="/"
                className="inline-block mt-5 h-11 px-7 rounded-pill bg-primary text-on-primary type-body leading-[44px]"
              >
                Analyze a stock
              </Link>
            </div>
          ) : (
            <div className="mt-8 bg-canvas border border-hairline rounded-lg overflow-hidden">
              {entries
                .slice()
                .sort((a, b) => a.ticker.localeCompare(b.ticker))
                .map((e) => {
                  const row = rows[e.ticker];
                  return (
                    <div
                      key={e.ticker}
                      className="flex items-center gap-4 px-6 py-4 border-t border-divider-soft first:border-t-0"
                    >
                      <Link
                        href={`/analyze?ticker=${encodeURIComponent(e.ticker)}&range=Max`}
                        className="flex items-center gap-4 flex-1 min-w-0"
                      >
                        <TickerLogo ticker={e.ticker} size={48} fontSize={14} />
                        {!row || row.status === "loading" ? (
                          <span className="type-caption text-ink-muted-48">Loading…</span>
                        ) : row.status === "error" ? (
                          <span className="type-caption" style={{ color: NEG }}>{row.message}</span>
                        ) : (
                          <span className="flex items-baseline gap-3 flex-wrap">
                            <span className="type-body-strong">{money(row.last, row.currency)}</span>
                            <span
                              className="type-caption-strong"
                              style={{ color: row.currentDD <= -0.0005 ? NEG : POS }}
                            >
                              {row.currentDD <= -0.0005 ? pct(row.currentDD) : "At high"}
                            </span>
                            <span className="type-caption text-ink-muted-48">
                              from running peak {money(row.runningPeak, row.currency)}
                            </span>
                          </span>
                        )}
                      </Link>
                      <button
                        onClick={() => remove(e.ticker)}
                        className="type-caption text-ink-muted-48 hover:text-negative cursor-pointer shrink-0"
                      >
                        Remove
                      </button>
                    </div>
                  );
                })}
            </div>
          )}
        </div>
      </main>
      <Footer />
    </>
  );
}
