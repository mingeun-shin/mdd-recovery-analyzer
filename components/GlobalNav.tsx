import Link from "next/link";

export function GlobalNav() {
  return (
    <nav className="bg-surface-black text-white shrink-0 pad-safe-top pad-safe-x">
      <div className="h-11 flex items-center gap-6">
        <Link
          href="/"
          className="font-[var(--font-display)] text-[15px] font-semibold tracking-tight text-white"
        >
          Drawdown
        </Link>
        <Link href="/watchlist" className="text-white opacity-85 type-nav-link">
          Watchlist
        </Link>
        {/* Attribution is the first thing worth dropping on a phone, where
            the two links need the width more. */}
        <div className="ml-auto items-center gap-4 opacity-85 type-nav-link hidden sm:flex">
          <span>Data via Twelve Data</span>
        </div>
      </div>
    </nav>
  );
}
