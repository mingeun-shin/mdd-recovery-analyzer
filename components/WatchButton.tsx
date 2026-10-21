"use client";

import { useWatchlist, WATCHLIST_MAX } from "@/lib/watchlist";

export function WatchButton({ ticker }: { ticker: string }) {
  const { has, add, remove, full } = useWatchlist();
  const watching = has(ticker);
  const blocked = !watching && full;

  return (
    <button
      onClick={() => (watching ? remove(ticker) : add(ticker))}
      disabled={blocked}
      title={blocked ? `Watchlist can hold at most ${WATCHLIST_MAX} tickers` : undefined}
      className="type-caption h-8 px-4 rounded-pill border cursor-pointer flex items-center gap-1.5 disabled:cursor-not-allowed disabled:opacity-50"
      style={
        watching
          ? { background: "var(--color-ink)", color: "#fff", borderColor: "var(--color-ink)" }
          : { background: "var(--color-canvas)", color: "var(--color-ink)", borderColor: "var(--color-hairline)" }
      }
    >
      <span>{watching ? "★" : "☆"}</span>
      {watching ? "Watching" : "Watch"}
    </button>
  );
}
