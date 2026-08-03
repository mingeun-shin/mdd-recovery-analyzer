"use client";

import { useWatchlist } from "@/lib/watchlist";

export function WatchButton({ ticker }: { ticker: string }) {
  const { has, toggle } = useWatchlist();
  const watching = has(ticker);

  return (
    <button
      onClick={() => toggle(ticker)}
      className="type-caption h-8 px-4 rounded-pill border cursor-pointer flex items-center gap-1.5"
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
