import { NextRequest, NextResponse } from "next/server";
import { fetchQuote, QuoteError } from "@/lib/quotes";

export async function GET(request: NextRequest) {
  const ticker = request.nextUrl.searchParams.get("ticker");
  if (!ticker) {
    return NextResponse.json({ error: "Missing ticker." }, { status: 400 });
  }

  try {
    const quote = await fetchQuote(ticker);
    return NextResponse.json(quote, {
      headers: { "Cache-Control": "public, s-maxage=60" },
    });
  } catch (err) {
    if (err instanceof QuoteError) {
      return NextResponse.json({ error: err.message }, { status: err.kind === "not-found" ? 404 : 502 });
    }
    console.error(err);
    return NextResponse.json({ error: "Failed to fetch quote." }, { status: 502 });
  }
}
