import { describe, expect, it } from "vitest";
import {
  analyzeTicker,
  bucketRecovery,
  computeEpisodes,
  computeMdd,
  currentDrawdown,
  daysBetween,
  fmtDate,
  fmtDays,
  fmtNum,
  fmtPct,
  fmtPrice,
  fmtYm,
  isoDate,
  nearestIdx,
  normalize,
  type SeriesPoint,
} from "./analyze";
import fixture from "./__fixtures__/synthetic.json";

const DAY_MS = 86400000;
const START = Date.UTC(2024, 0, 1); // a Monday

/** One close per calendar day, starting 2024-01-01. */
function daily(prices: number[]): SeriesPoint[] {
  return prices.map((p, i) => ({ ms: START + i * DAY_MS, p }));
}

describe("computeMdd", () => {
  it("measures the deepest fall from the running peak and when it was regained", () => {
    const m = computeMdd(daily([100, 120, 90, 130]));
    expect(m.mdd).toBe(-25);
    expect(m.peakIdx).toBe(1);
    expect(m.troughIdx).toBe(2);
    expect(m.recoveryIdx).toBe(3);
    expect(m.peakVal).toBe(120);
    expect(m.runningMax).toEqual([100, 120, 120, 130]);
    expect(m.dd).toEqual([0, 0, -25, 0]);
  });

  it("leaves recovery empty when the prior peak is never regained", () => {
    expect(computeMdd(daily([100, 120, 90, 100])).recoveryIdx).toBeNull();
  });

  it("dates the peak at the last close equal to it before the trough", () => {
    // 120 is hit twice; the drawdown is measured from the second time.
    const m = computeMdd(daily([100, 120, 110, 120, 90, 125]));
    expect(m.peakIdx).toBe(3);
    expect(m.troughIdx).toBe(4);
    expect(m.recoveryIdx).toBe(5);
  });

  it("takes the first trough when the minimum repeats", () => {
    const m = computeMdd(daily([100, 80, 100, 80, 90]));
    expect(m.troughIdx).toBe(1);
    expect(m.recoveryIdx).toBe(2);
  });

  it("reports no drawdown for a series that only rises", () => {
    const m = computeMdd(daily([1, 2, 3]));
    expect(m.mdd).toBe(0);
    expect(m.peakIdx).toBe(0);
    expect(m.troughIdx).toBe(0);
  });
});

describe("computeEpisodes", () => {
  it("finds every peak → trough → recovery cycle, deepest first", () => {
    const eps = computeEpisodes(daily([100, 120, 110, 120, 90, 125]));
    expect(eps.map((e) => [e.peakIdx, e.troughIdx, e.recoveryIdx])).toEqual([
      [3, 4, 5],
      [1, 2, 3],
    ]);
    expect(eps[0].depth).toBe(-25);
    expect(eps[1].depth).toBeCloseTo(-8.3333, 4);
  });

  it("counts a close equal to the prior high as a recovery", () => {
    const [e] = computeEpisodes(daily([100, 90, 100]));
    expect(e.recoveryIdx).toBe(2);
  });

  it("keeps a drawdown that is still open at the end of the data", () => {
    const eps = computeEpisodes(daily([100, 90, 95]));
    expect(eps).toHaveLength(1);
    expect(eps[0]).toMatchObject({ peakIdx: 0, troughIdx: 1, recoveryIdx: null, depth: -10 });
  });

  it("filters dips shallower than 0.005%", () => {
    expect(computeEpisodes(daily([100, 99.996, 101]))).toEqual([]);
    expect(computeEpisodes(daily([100, 99.99, 101]))).toHaveLength(1);
  });

  it("finds nothing in a series that only rises", () => {
    expect(computeEpisodes(daily([1, 2, 3]))).toEqual([]);
  });
});

describe("bucketRecovery", () => {
  // Episodes: -3% (2 days to recover), -4% (1 day), -7% (3 days), -12% (open).
  const series = daily([100, 97, 99, 100, 96, 100, 93, 95, 97, 100, 88, 90]);

  it("groups episodes into 5-point bands and averages recovered ones only", () => {
    const buckets = bucketRecovery(series, computeEpisodes(series));
    expect(buckets).toEqual([
      { lo: 0, hi: 5, label: "0–5%", count: 2, recovered: 2, prob: 100, avgDays: 1.5 },
      { lo: 5, hi: 10, label: "5–10%", count: 1, recovered: 1, prob: 100, avgDays: 3 },
      { lo: 10, hi: 15, label: "10–15%", count: 1, recovered: 0, prob: 0, avgDays: null },
    ]);
  });

  it("skips empty bands", () => {
    const s = daily([100, 97, 100, 88, 90]);
    expect(bucketRecovery(s, computeEpisodes(s)).map((b) => b.label)).toEqual(["0–5%", "10–15%"]);
  });

  it("puts a drawdown that lands exactly on a band edge in the band above", () => {
    // 100 → 95 is exactly -5%. The spec's floor((max - 1e-9) / 5) + 1 sized
    // the bands so that the 5–10% band was never created and the episode
    // vanished from the chart.
    const s = daily([100, 95, 100]);
    expect(bucketRecovery(s, computeEpisodes(s))).toEqual([
      { lo: 5, hi: 10, label: "5–10%", count: 1, recovered: 1, prob: 100, avgDays: 1 },
    ]);
    const deeper = daily([100, 97, 100, 90, 100]);
    expect(bucketRecovery(deeper, computeEpisodes(deeper)).map((b) => [b.label, b.count])).toEqual([
      ["0–5%", 1],
      ["10–15%", 1],
    ]);
  });

  it("returns nothing when there are no episodes", () => {
    expect(bucketRecovery(daily([1, 2]), [])).toEqual([]);
  });
});

describe("currentDrawdown", () => {
  const series = daily([100, 120, 90, 110]);
  const { runningMax } = computeMdd(series);

  it("falls back to the last close without a live price", () => {
    const cur = currentDrawdown(series, runningMax, null);
    expect(cur.basis).toBe("Last close");
    expect(cur.value).toBeCloseTo(-8.3333, 4);
    expect(cur.atHigh).toBe(false);
  });

  it("lets a live price above the range high set a new high", () => {
    expect(currentDrawdown(series, runningMax, 130)).toEqual({ value: 0, basis: "Live price", atHigh: true });
  });

  it("treats anything within 0.005% of the high as at the high", () => {
    expect(currentDrawdown(series, runningMax, 119.995).atHigh).toBe(true);
  });
});

describe("helpers", () => {
  it("normalize indexes a series to 100 on its first close", () => {
    expect(normalize(daily([50, 75, 100]))).toEqual([100, 150, 200]);
  });

  it("nearestIdx finds the closest point and clamps at the ends", () => {
    const s = daily([1, 2, 3]);
    expect(nearestIdx(s, START + 1.4 * DAY_MS)).toBe(1);
    expect(nearestIdx(s, START + 1.6 * DAY_MS)).toBe(2);
    expect(nearestIdx(s, START - DAY_MS)).toBe(0);
    expect(nearestIdx(s, START + 10 * DAY_MS)).toBe(2);
  });

  it("daysBetween counts calendar days, so a weekend counts", () => {
    const friToMon = [
      { ms: Date.UTC(2024, 0, 5), p: 1 },
      { ms: Date.UTC(2024, 0, 8), p: 1 },
    ];
    expect(daysBetween(friToMon, 0, 1)).toBe(3);
  });
});

describe("formatting", () => {
  it("fmtPrice uses 4, 2 or 0 decimals by magnitude", () => {
    expect(fmtPrice(9.87654)).toBe("9.8765");
    expect(fmtPrice(0.5)).toBe("0.5000");
    expect(fmtPrice(123.456)).toBe("123.46");
    expect(fmtPrice(-12.5)).toBe("-12.50");
    expect(fmtPrice(1234.5)).toBe("1,235");
    expect(fmtPrice(223500)).toBe("223,500");
    expect(fmtPrice(null)).toBe("—");
  });

  it("fmtPct shows two decimals and an optional sign", () => {
    expect(fmtPct(-24.496377)).toBe("-24.50%");
    expect(fmtPct(0.2, true)).toBe("+0.20%");
    expect(fmtPct(-0.12, true)).toBe("-0.12%");
    expect(fmtPct(undefined)).toBe("—");
  });

  it("formats dates per surface", () => {
    const ms = Date.UTC(2022, 0, 3);
    expect(fmtDate(ms)).toBe("2022.01.03");
    expect(isoDate(ms)).toBe("2022-01-03");
    expect(fmtYm(ms)).toBe("22.01");
  });

  it("formats numbers and day counts", () => {
    expect(fmtNum(1234.567)).toBe("1,234.57");
    expect(fmtDays(1)).toBe("1 day");
    expect(fmtDays(1254)).toBe("1,254 days");
    expect(fmtDays(null)).toBe("—");
  });
});

describe("agreement with the Python reference (scripts/spec_reference.py)", () => {
  // 2,500 synthetic trading days with weekend gaps, two recovered crashes and
  // an open drawdown at the end. Regenerate with: python3 scripts/spec_reference.py
  const series = fixture.points.map((p) => ({ ms: Date.parse(p.t), p: p.c }));
  const a = analyzeTicker(series);
  const exp = fixture.expected;
  const day = (i: number | null) => (i == null ? null : fixture.points[i].t);

  it("finds the same maximum drawdown", () => {
    expect(a.mdd.mdd).toBeCloseTo(exp.mdd, 5);
    expect(a.mdd.peakVal).toBeCloseTo(exp.peakVal, 5);
    expect(day(a.mdd.peakIdx)).toBe(exp.peak);
    expect(day(a.mdd.troughIdx)).toBe(exp.trough);
    expect(day(a.mdd.recoveryIdx)).toBe(exp.recovery);
  });

  it("finds the same episodes in the same order", () => {
    expect(a.episodes).toHaveLength(exp.episodes.length);
    a.episodes.forEach((e, i) => {
      expect([day(e.peakIdx), day(e.troughIdx), day(e.recoveryIdx)]).toEqual([
        exp.episodes[i].peak,
        exp.episodes[i].trough,
        exp.episodes[i].recovery,
      ]);
      expect(e.depth).toBeCloseTo(exp.episodes[i].depth, 5);
    });
  });

  it("computes the same buckets", () => {
    expect(a.buckets.map(({ lo, hi, count, recovered }) => ({ lo, hi, count, recovered }))).toEqual(
      exp.buckets.map(({ lo, hi, count, recovered }) => ({ lo, hi, count, recovered }))
    );
    a.buckets.forEach((b, i) => {
      const want = exp.buckets[i].avgDays;
      if (want == null) expect(b.avgDays).toBeNull();
      else expect(b.avgDays).toBeCloseTo(want, 5);
    });
  });
});
