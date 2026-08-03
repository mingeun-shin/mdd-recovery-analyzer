import Link from "next/link";

export function GlobalNav() {
  return (
    <nav className="h-11 bg-surface-black text-white flex items-center gap-6 px-6 shrink-0">
      <Link
        href="/"
        className="font-[var(--font-display)] text-[15px] font-semibold tracking-tight text-white"
      >
        Drawdown
      </Link>
      <Link href="/watchlist" className="text-white opacity-85 type-nav-link">
        Watchlist
      </Link>
      <div className="ml-auto flex items-center gap-4 opacity-85 type-nav-link">
        <span>Data via Twelve Data</span>
      </div>
    </nav>
  );
}
