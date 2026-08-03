export type SeriesPoint = { ms: number; p: number };

export type Episode = {
  peakIdx: number;
  troughIdx: number;
  peakPrice: number;
  troughPrice: number;
  depth: number; // negative fraction, e.g. -0.42
  recIdx: number | null;
  fallDays: number;
  recDays: number | null;
  totalDays: number;
};

export type Analysis = {
  dd: number[]; // drawdown fraction at each index, relative to running peak
  mdd: number; // most negative drawdown fraction in the series
  main: Episode; // the episode containing the max drawdown
  episodes: Episode[]; // all episodes at least minDepthPct deep, deepest peak-first order as found
  currentDD: number;
  runningPeak: number;
};

const DAY_MS = 86400000;

/**
 * Computes the running-peak drawdown series and segments it into discrete
 * "episodes" (peak -> trough -> recovery-or-ongoing), matching the design
 * mock's analyze() but generalized to any-length, non-uniformly-spaced
 * daily series.
 */
export function analyze(series: SeriesPoint[], minDepthPct: number): Analysis {
  const n = series.length;
  const dd = new Array<number>(n);
  let peak = -Infinity;
  let peakIdx = 0;
  let mdd = 0;
  let troughIdxOfMdd = 0;
  let peakIdxOfMdd = 0;

  const episodes: Episode[] = [];
  let current: Omit<Episode, "fallDays" | "recDays" | "totalDays"> | null = null;

  for (let i = 0; i < n; i++) {
    const price = series[i].p;
    if (price >= peak) {
      peak = price;
      peakIdx = i;
      if (current) {
        current.recIdx = i;
        episodes.push(finalizeEpisode(current, series, n));
        current = null;
      }
    }
    const d = price / peak - 1;
    dd[i] = d;

    if (d < 0) {
      if (!current) {
        current = { peakIdx, peakPrice: peak, troughIdx: i, troughPrice: series[i].p, depth: d, recIdx: null };
      }
      if (d < current.depth) {
        current.depth = d;
        current.troughIdx = i;
        current.troughPrice = series[i].p;
      }
    }
    if (d < mdd) {
      mdd = d;
      troughIdxOfMdd = i;
      peakIdxOfMdd = peakIdx;
    }
  }
  if (current) episodes.push(finalizeEpisode(current, series, n));

  const kept = episodes.filter((e) => e.depth <= -minDepthPct / 100);

  const main =
    kept.find((e) => e.troughIdx === troughIdxOfMdd) ??
    finalizeEpisode(
      {
        peakIdx: peakIdxOfMdd,
        peakPrice: series[peakIdxOfMdd].p,
        troughIdx: troughIdxOfMdd,
        troughPrice: series[troughIdxOfMdd].p,
        depth: mdd,
        recIdx: null,
      },
      series,
      n
    );

  return {
    dd,
    mdd,
    main,
    episodes: kept,
    currentDD: dd[n - 1],
    runningPeak: Math.max(...series.map((s) => s.p)),
  };
}

function finalizeEpisode(
  e: Omit<Episode, "fallDays" | "recDays" | "totalDays">,
  series: SeriesPoint[],
  n: number
): Episode {
  const fallDays = Math.round((series[e.troughIdx].ms - series[e.peakIdx].ms) / DAY_MS);
  const recDays = e.recIdx == null ? null : Math.round((series[e.recIdx].ms - series[e.troughIdx].ms) / DAY_MS);
  const totalDays = Math.round(
    ((e.recIdx == null ? series[n - 1].ms : series[e.recIdx].ms) - series[e.peakIdx].ms) / DAY_MS
  );
  return { ...e, fallDays, recDays, totalDays };
}

export function median(arr: number[]): number | null {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function fmtDate(ms: number): string {
  const d = new Date(ms);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

export function fmtMonth(ms: number): string {
  const d = new Date(ms);
  return `${MONTHS[d.getUTCMonth()]} ${String(d.getUTCFullYear()).slice(2)}`;
}

export function isoDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function money(v: number | null | undefined, currency = "USD"): string {
  if (v == null || !Number.isFinite(v)) return "—";
  const symbol = currency === "USD" ? "$" : currency + " ";
  return symbol + (v < 5 ? v.toFixed(3) : v.toFixed(2));
}

export function pct(v: number, dp = 1): string {
  return (v > 0 ? "+" : "") + (v * 100).toFixed(dp) + "%";
}

export function fmtDur(d: number | null): string {
  if (d == null) return "—";
  if (d < 60) return d + " days";
  const y = Math.floor(d / 365);
  const m = Math.round((d - y * 365) / 30.44);
  if (y === 0) return m + " mo";
  if (m >= 12) return y + 1 + " yr";
  return m ? `${y} yr ${m} mo` : y + " yr";
}
