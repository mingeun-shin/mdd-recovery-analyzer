import { NextRequest, NextResponse } from "next/server";
import { fetchSeries, QuoteError } from "@/lib/quotes";

export async function GET(request: NextRequest) {
  const ticker = request.nextUrl.searchParams.get("ticker");
  if (!ticker) {
    return NextResponse.json({ error: "Missing ticker." }, { status: 400 });
  }

  try {
    const series = await fetchSeries(ticker);
    return NextResponse.json(series);
  } catch (err) {
    if (err instanceof QuoteError) {
      return NextResponse.json({ error: err.message }, { status: 404 });
    }
    console.error(err);
    return NextResponse.json({ error: "Failed to fetch price data." }, { status: 502 });
  }
}
