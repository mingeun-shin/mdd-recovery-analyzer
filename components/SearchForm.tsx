"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

const POPULAR = ["AAPL", "MSFT", "NVDA", "DIS", "PYPL", "TSLA"];

export function SearchForm() {
  const router = useRouter();
  const [ticker, setTicker] = useState("");
  const [error, setError] = useState<string | null>(null);

  function go(t: string) {
    const clean = t.trim().toUpperCase();
    if (!clean) {
      setError("Enter a ticker symbol first.");
      return;
    }
    // Always start from the full available history — narrowing the range
    // is easy from the results page once you can see what's there, but
    // guessing a range up front risks landing on "not enough data" for
    // recently-listed companies.
    router.push(`/analyze?ticker=${encodeURIComponent(clean)}&range=Max`);
  }

  return (
    <div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          go(ticker);
        }}
      >
        <div className="flex items-center gap-3 flex-wrap">
          <input
            type="text"
            value={ticker}
            onChange={(e) => {
              setTicker(e.target.value);
              setError(null);
            }}
            placeholder="Ticker, e.g. AAPL"
            autoFocus
            className="flex-1 min-w-[240px] h-11 rounded-pill border border-hairline bg-canvas px-5 type-body outline-none focus-visible:border-primary"
          />
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
