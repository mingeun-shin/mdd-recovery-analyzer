import { NextRequest, NextResponse } from "next/server";
import { fetchSeries, QuoteError } from "@/lib/quotes";

export async function GET(request: NextRequest) {
  const ticker = request.nextUrl.searchParams.get("ticker");
  if (!ticker) {
    return NextResponse.json({ error: "Missing ticker." }, { status: 400 });
  }

  try {
    const series = await fetchSeries(ticker);
    // Lets the CDN absorb repeat views for the same 30 minutes the server
    // caches for, so popular tickers rarely reach Yahoo at all.
    return NextResponse.json(series, {
      headers: { "Cache-Control": "public, s-maxage=1800, stale-while-revalidate=300" },
    });
  } catch (err) {
    if (err instanceof QuoteError) {
      // 404 is "this ticker has no data" and lets the client fall back from
      // compare mode; anything else is a fetch failure worth surfacing as-is.
      return NextResponse.json({ error: err.message }, { status: err.kind === "not-found" ? 404 : 502 });
    }
    console.error(err);
    return NextResponse.json({ error: "Failed to fetch price data." }, { status: 502 });
  }
}
