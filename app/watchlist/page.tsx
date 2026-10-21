"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { GlobalNav } from "@/components/GlobalNav";
import { Footer } from "@/components/Footer";
import { useWatchlist, WATCHLIST_MAX } from "@/lib/watchlist";
import { TickerLogo } from "@/components/TickerLogo";
import { computeMdd, currentDrawdown, fmtPct, fmtPrice, type SeriesPoint } from "@/lib/analyze";
import type { LiveQuote, QuoteSeries } from "@/lib/quotes";

const NEG = "#bf3a2c";
const POS = "#1a7f4b";

type RowState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | {
      status: "ready";
      currency: string;
      price: number;
      basis: string;
      currentDD: number;
      atHigh: boolean;
      high: number;
    };

export default function WatchlistPage() {
  const { tickers, remove } = useWatchlist();
  const [rows, setRows] = useState<Record<string, RowState>>({});

  useEffect(() => {
    const pending = tickers.filter((t) => !rows[t]);
    if (!pending.length) return;

    let cancelled = false;

    async function loadOne(t: string) {
      setRows((prev) => ({ ...prev, [t]: { status: "loading" } }));
      try {
        const [seriesRes, quoteRes] = await Promise.all([
          fetch(`/api/series?ticker=${encodeURIComponent(t)}`),
          fetch(`/api/quote?ticker=${encodeURIComponent(t)}`),
        ]);
        const body = await seriesRes.json();
        if (!seriesRes.ok) throw new Error(body.error || "Failed to load.");
        const data = body as QuoteSeries;
        // The live quote is a nice-to-have here; without it the row falls back
        // to the last close, same as the analyze page.
        const quote: LiveQuote | null = quoteRes.ok ? await quoteRes.json() : null;
        const series: SeriesPoint[] = data.points.map((p) => ({ ms: Date.parse(p.t), p: p.c }));
        const { runningMax } = computeMdd(series);
        const cur = currentDrawdown(series, runningMax, quote?.last ?? null);
        if (cancelled) return;
        setRows((prev) => ({
          ...prev,
          [t]: {
            status: "ready",
            currency: quote?.currency ?? data.currency,
            price: quote?.last ?? series[series.length - 1].p,
            basis: cur.basis,
            currentDD: cur.value,
            atHigh: cur.atHigh,
            high: Math.max(runningMax[runningMax.length - 1], quote?.last ?? 0),
          },
        }));
      } catch (err) {
        if (cancelled) return;
        setRows((prev) => ({ ...prev, [t]: { status: "error", message: (err as Error).message } }));
      }
    }

    // At most WATCHLIST_MAX tickers, each cached server-side, so no batching.
    pending.forEach(loadOne);

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tickers]);

  return (
    <>
      <GlobalNav />
      <main className="flex-1 bg-parchment">
        <div className="max-w-[1000px] mx-auto px-6 py-16">
          <div className="type-display-lg">Watchlist</div>
          <p className="type-body text-ink-muted-80 mt-3">
            Saved on this device only, up to {WATCHLIST_MAX} tickers ({tickers.length}/{WATCHLIST_MAX}). Tap a ticker
            to open its full drawdown analysis.
          </p>

          {tickers.length === 0 ? (
            <div className="mt-10 bg-canvas border border-hairline rounded-lg p-10 text-center">
              <p className="type-body text-ink-muted-80">No tickers saved yet.</p>
              <Link
                href="/"
                className="inline-block mt-5 h-11 px-7 rounded-pill bg-primary text-on-primary type-body leading-[44px]"
              >
                Analyze a stock
              </Link>
            </div>
          ) : (
            <div className="mt-8 bg-canvas border border-hairline rounded-lg overflow-hidden">
              {tickers.map((t) => {
                const row = rows[t];
                return (
                  <div
                    key={t}
                    className="flex items-center gap-4 px-6 py-4 border-t border-divider-soft first:border-t-0"
                  >
                    <Link href={`/analyze?ticker=${encodeURIComponent(t)}`} className="flex items-center gap-4 flex-1 min-w-0">
                      <TickerLogo ticker={t} size={48} fontSize={12} />
                      {!row || row.status === "loading" ? (
                        <span className="type-caption text-ink-muted-48">Loading…</span>
                      ) : row.status === "error" ? (
                        <span className="type-caption" style={{ color: NEG }}>{row.message}</span>
                      ) : (
                        <span className="flex items-baseline gap-3 flex-wrap">
                          <span className="type-body-strong tabular-nums">
                            {fmtPrice(row.price)} <span className="type-caption text-ink-muted-48">{row.currency}</span>
                          </span>
                          <span className="type-caption-strong tabular-nums" style={{ color: row.atHigh ? POS : NEG }}>
                            {row.atHigh ? "At high" : fmtPct(row.currentDD)}
                          </span>
                          <span className="type-caption text-ink-muted-48">
                            {row.basis} vs. all-time high {fmtPrice(row.high)}
                          </span>
                        </span>
                      )}
                    </Link>
                    <button
                      onClick={() => remove(t)}
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
