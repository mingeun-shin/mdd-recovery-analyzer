import { NextRequest, NextResponse } from "next/server";
import { searchSymbols } from "@/lib/quotes";

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q") || "";
  const results = await searchSymbols(q);
  return NextResponse.json({ results });
}
