import { describe, expect, it } from "vitest";
import { isValidTicker, normalizeTicker } from "./ticker";

describe("tickers", () => {
  it("trims and uppercases", () => {
    expect(normalizeTicker("  spy ")).toBe("SPY");
  });

  it("accepts Yahoo's symbol conventions", () => {
    for (const t of ["AAPL", "brk-b", "BTC-USD", "^GSPC", "GC=F", "VOD.L"]) {
      expect(isValidTicker(t), t).toBe(true);
    }
  });

  it("rejects empty, overlong or punctuated input", () => {
    for (const t of ["", "   ", "AAPL MSFT", "A;DROP", "../etc", "X".repeat(16)]) {
      expect(isValidTicker(t), JSON.stringify(t)).toBe(false);
    }
  });
});
