"use client";

import Image from "next/image";
import { useState } from "react";

// Unofficial, unauthenticated free endpoint keyed directly by ticker — no
// documented quota or SLA, so any failure (404, timeout, endpoint going
// away) silently falls back to the plain ticker-text box rather than a
// broken image.
function logoUrl(ticker: string) {
  return `https://financialmodelingprep.com/image-stock/${encodeURIComponent(ticker)}.png`;
}

export function TickerLogo({
  ticker,
  size = 56,
  fontSize = 18,
  className = "",
}: {
  ticker: string;
  size?: number;
  fontSize?: number;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);

  return (
    <div
      className={`rounded-sm bg-parchment border border-hairline flex items-center justify-center overflow-hidden shrink-0 ${className}`}
      style={{ width: size, height: size }}
    >
      {failed ? (
        <span className="type-display-md" style={{ fontSize }}>
          {ticker}
        </span>
      ) : (
        <Image
          src={logoUrl(ticker)}
          alt=""
          width={size}
          height={size}
          unoptimized
          className="w-full h-full object-contain p-1"
          onError={() => setFailed(true)}
        />
      )}
    </div>
  );
}
