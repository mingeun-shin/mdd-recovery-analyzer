"use client";

import { useState } from "react";
import { useWatchlist, WATCHLIST_MAX } from "@/lib/watchlist";

/**
 * Inline watchlist for the analyze page: tap a ticker to make it the main
 * ticker, × to remove it, or add one from the field at the end.
 */
export function WatchlistBar({ active, onSelect }: { active: string; onSelect: (ticker: string) => void }) {
  const { tickers, add, remove } = useWatchlist();
  const [draft, setDraft] = useState("");
  const [note, setNote] = useState<string | null>(null);

  function submit() {
    const t = draft.trim().toUpperCase();
    const result = add(t);
    if (result === "duplicate") setNote(`${t} is already on your watchlist.`);
    else if (result === "full") setNote(`Your watchlist can hold at most ${WATCHLIST_MAX} tickers.`);
    else {
      setNote(null);
      if (result === "added") setDraft("");
    }
  }

  return (
    <div>
      <div className="flex items-center gap-2 flex-wrap">
        <span className="type-caption-strong mr-1">
          Watchlist <span className="text-ink-muted-48 font-normal tabular-nums">{tickers.length}/{WATCHLIST_MAX}</span>
        </span>

        {tickers.length === 0 && <span className="type-caption text-ink-muted-48">No tickers saved yet.</span>}

        {tickers.map((t) => {
          const on = t === active;
          return (
            <span
              key={t}
              className="inline-flex items-center h-8 rounded-pill border type-caption-strong overflow-hidden"
              style={
                on
                  ? { background: "var(--color-primary)", color: "#fff", borderColor: "var(--color-primary)" }
                  : { background: "var(--color-canvas)", color: "var(--color-ink)", borderColor: "var(--color-hairline)" }
              }
            >
              <button type="button" onClick={() => onSelect(t)} className="h-full pl-3.5 pr-1.5 cursor-pointer">
                {t}
              </button>
              <button
                type="button"
                onClick={() => remove(t)}
                aria-label={`Remove ${t} from watchlist`}
                className="h-full pl-1 pr-3 cursor-pointer opacity-60 hover:opacity-100"
              >
                ×
              </button>
            </span>
          );
        })}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
          className="flex items-center gap-1.5"
        >
          <input
            type="text"
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              setNote(null);
            }}
            placeholder="Add ticker"
            autoComplete="off"
            className="type-caption h-8 w-28 px-3.5 rounded-pill border border-hairline bg-canvas outline-none focus-visible:border-primary"
          />
          {/* Not disabled when full: pressing it is what surfaces the cap message. */}
          <button
            type="submit"
            className="type-caption h-8 px-3.5 rounded-pill border border-hairline bg-canvas cursor-pointer hover:border-primary hover:text-primary"
          >
            Add
          </button>
        </form>
      </div>
      {note && <p className="type-caption text-ink-muted-80 mt-2">{note}</p>}
    </div>
  );
}
