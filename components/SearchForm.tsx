"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { isValidTicker } from "@/lib/ticker";

const POPULAR = ["AAPL", "MSFT", "NVDA", "DIS", "PYPL", "TSLA"];

type Suggestion = { symbol: string; name: string; exchange: string };

export function SearchForm() {
  const router = useRouter();
  const [ticker, setTicker] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const q = ticker.trim();
    if (!q) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      fetch(`/api/search?q=${encodeURIComponent(q)}`)
        .then((res) => res.json())
        .then((body) => {
          if (cancelled) return;
          const results: Suggestion[] = body.results || [];
          setSuggestions(results);
          setOpen(results.length > 0);
          setActiveIndex(0);
        })
        .catch(() => {
          if (!cancelled) setSuggestions([]);
        });
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [ticker]);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  function go(t: string) {
    const clean = t.trim().toUpperCase();
    if (!clean) {
      setError("Enter a ticker symbol first.");
      return;
    }
    if (!isValidTicker(clean)) {
      setError(`"${clean}" doesn't look like a valid ticker symbol.`);
      return;
    }
    setOpen(false);
    // Always start from the full available history — narrowing the range
    // is easy from the results page once you can see what's there, but
    // guessing a range up front risks landing on "not enough data" for
    // recently-listed companies.
    router.push(`/analyze?ticker=${encodeURIComponent(clean)}&range=Max`);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || suggestions.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => (i + 1) % suggestions.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => (i <= 0 ? suggestions.length - 1 : i - 1));
    } else if (e.key === "Escape") {
      setOpen(false);
    } else if (e.key === "Enter") {
      e.preventDefault();
      go(suggestions[activeIndex >= 0 ? activeIndex : 0].symbol);
    }
  }

  return (
    <div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          go(ticker);
        }}
      >
        <div ref={containerRef} className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[240px]">
            <input
              type="text"
              value={ticker}
              onChange={(e) => {
                setTicker(e.target.value);
                setError(null);
              }}
              onKeyDown={onKeyDown}
              onFocus={() => suggestions.length > 0 && setOpen(true)}
              placeholder="Ticker or company name, e.g. AAPL"
              autoFocus
              autoComplete="off"
              role="combobox"
              aria-expanded={open}
              aria-autocomplete="list"
              aria-controls="ticker-suggestions"
              className="w-full h-11 rounded-pill border border-hairline bg-canvas px-5 type-body outline-none focus-visible:border-primary"
            />
            {open && ticker.trim() && (
              <ul
                id="ticker-suggestions"
                role="listbox"
                className="absolute left-0 right-0 top-[calc(100%+6px)] z-20 bg-canvas border border-hairline rounded-lg overflow-hidden max-h-72 overflow-y-auto"
              >
                {suggestions.map((s, i) => (
                  <li key={`${s.symbol}-${s.exchange}-${i}`}>
                    <button
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onMouseEnter={() => setActiveIndex(i)}
                      onClick={() => go(s.symbol)}
                      className={`w-full flex items-baseline gap-3 px-4 py-2.5 text-left cursor-pointer ${
                        i === activeIndex ? "bg-parchment" : ""
                      }`}
                    >
                      <span className="type-caption-strong">{s.symbol}</span>
                      <span className="type-caption text-ink-muted-48 truncate">{s.name}</span>
                      {s.exchange && (
                        <span className="type-micro-legal text-ink-muted-48 ml-auto shrink-0">{s.exchange}</span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <button
            type="submit"
            className="h-11 px-7 rounded-pill bg-primary text-on-primary type-body cursor-pointer active:scale-95 transition-transform"
          >
            Analyze
          </button>
        </div>
        {error && <p className="type-caption text-negative mt-2">{error}</p>}
      </form>

      <div className="mt-8">
        <div className="type-caption text-ink-muted-48 mb-2">Or try one of these</div>
        <div className="flex items-center gap-2 flex-wrap">
          {POPULAR.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => go(t)}
              className="h-9 px-4 rounded-pill border border-hairline bg-canvas type-caption-strong cursor-pointer hover:border-primary hover:text-primary transition-colors"
            >
              {t}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
