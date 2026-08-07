import type { Metadata } from "next";
import Link from "next/link";
import { GlobalNav } from "@/components/GlobalNav";

export const metadata: Metadata = {
  title: "Offline · Drawdown Analyzer",
};

/**
 * Served by the service worker when a navigation fails and nothing cached
 * matches. Intentionally static — it has to render without hitting the
 * network, so nothing here fetches or requires client JS.
 */
export default function Offline() {
  return (
    <>
      <GlobalNav />
      <main className="flex-1 bg-parchment">
        <div className="max-w-[760px] mx-auto px-6 py-16 sm:py-24">
          <h1 className="type-display-md">You&apos;re offline.</h1>
          <p className="type-body text-ink-muted-80 mt-4 max-w-[52ch] text-pretty">
            This page needs a connection. Tickers you&apos;ve already analyzed are stored on
            this device and still work — open one from your watchlist.
          </p>
          <Link
            href="/watchlist"
            className="inline-flex items-center justify-center mt-8 h-11 px-6 rounded-pill bg-primary text-on-primary type-body-strong no-underline hover:no-underline"
          >
            Go to watchlist
          </Link>
        </div>
      </main>
    </>
  );
}
