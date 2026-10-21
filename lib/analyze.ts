export type SeriesPoint = { ms: number; p: number };

/** compute_mdd: the single deepest peak → trough decline in the range. */
export type MddResult = {
  dd: number[]; // percent below the running peak at each index, ≤ 0
  runningMax: number[];
  peakIdx: number;
  troughIdx: number;
  recoveryIdx: number | null;
  mdd: number; // percent, e.g. -24.5
  peakVal: number;
};

/** One peak → trough → recovery (or still-open) cycle. */
export type Episode = {
  peakIdx: number;
  troughIdx: number;
  recoveryIdx: number | null;
  depth: number; // percent, e.g. -24.5
};

export type RecoveryBucket = {
  lo: number;
  hi: number;
  label: string;
  count: number;
  recovered: number;
  prob: number; // recovered / count, percent — computed but not displayed
  avgDays: number | null; // mean trough → recovery days over recovered episodes
};

export type TickerAnalysis = {
  mdd: MddResult;
  episodes: Episode[]; // deepest first
  buckets: RecoveryBucket[];
};

const DAY_MS = 86400000;
const BUCKET_PCT = 5;

/** Calendar days between two points, matching pandas' Timedelta.days. */
export function daysBetween(series: SeriesPoint[], from: number, to: number): number {
  return Math.round((series[to].ms - series[from].ms) / DAY_MS);
}

export function computeMdd(series: SeriesPoint[]): MddResult {
  const n = series.length;
  const runningMax = new Array<number>(n);
  const dd = new Array<number>(n);
  let max = -Infinity;
  let troughIdx = 0;
  for (let i = 0; i < n; i++) {
    max = Math.max(max, series[i].p);
    runningMax[i] = max;
    dd[i] = ((series[i].p - max) / max) * 100;
    // Strict < keeps the first occurrence of the minimum, like idxmin().
    if (dd[i] < dd[troughIdx]) troughIdx = i;
  }

  const peakVal = runningMax[troughIdx];
  let peakIdx = troughIdx;
  while (peakIdx > 0 && series[peakIdx].p !== peakVal) peakIdx--;

  let recoveryIdx: number | null = null;
  for (let i = troughIdx + 1; i < n; i++) {
    if (series[i].p >= peakVal) {
      recoveryIdx = i;
      break;
    }
  }

  return { dd, runningMax, peakIdx, troughIdx, recoveryIdx, mdd: dd[troughIdx], peakVal };
}

export function computeEpisodes(series: SeriesPoint[]): Episode[] {
  const p = series.map((s) => s.p);
  const raw: Omit<Episode, "depth">[] = [];
  let curPeak = 0;
  let curTrough: number | null = null;

  for (let i = 1; i < p.length; i++) {
    if (p[i] >= p[curPeak]) {
      // A new (or equal) high closes any open drawdown on this bar.
      if (curTrough != null) raw.push({ peakIdx: curPeak, troughIdx: curTrough, recoveryIdx: i });
      curTrough = null;
      curPeak = i;
    } else if (curTrough == null || p[i] < p[curTrough]) {
      curTrough = i;
    }
  }
  if (curTrough != null) raw.push({ peakIdx: curPeak, troughIdx: curTrough, recoveryIdx: null });

  return raw
    .map((e) => ({ ...e, depth: ((p[e.troughIdx] - p[e.peakIdx]) / p[e.peakIdx]) * 100 }))
    .filter((e) => e.depth < -0.005)
    .sort((a, b) => a.depth - b.depth);
}

export function bucketRecovery(series: SeriesPoint[], episodes: Episode[]): RecoveryBucket[] {
  if (!episodes.length) return [];
  const maxDepth = Math.max(...episodes.map((e) => Math.abs(e.depth)));
  // Deliberately not the spec's floor((max - 1e-9) / 5) + 1: that never
  // creates the band for a depth sitting exactly on an edge (a $100 stock
  // closing at $95), so the deepest episode could drop out of the chart.
  const nBuckets = Math.floor(maxDepth / BUCKET_PCT) + 1;

  const buckets: RecoveryBucket[] = [];
  for (let i = 0; i < nBuckets; i++) {
    const lo = BUCKET_PCT * i;
    const hi = BUCKET_PCT * (i + 1);
    const group = episodes.filter((e) => Math.abs(e.depth) >= lo && Math.abs(e.depth) < hi);
    if (!group.length) continue;
    const rec = group.filter((e) => e.recoveryIdx != null);
    buckets.push({
      lo,
      hi,
      label: `${lo}–${hi}%`,
      count: group.length,
      recovered: rec.length,
      prob: (rec.length / group.length) * 100,
      avgDays: rec.length
        ? rec.reduce((sum, e) => sum + daysBetween(series, e.troughIdx, e.recoveryIdx as number), 0) / rec.length
        : null,
    });
  }
  return buckets;
}

export function analyzeTicker(series: SeriesPoint[]): TickerAnalysis {
  const episodes = computeEpisodes(series);
  return { mdd: computeMdd(series), episodes, buckets: bucketRecovery(series, episodes) };
}

/**
 * Spec §3.5: distance below the range high, measured from the live price when
 * there is one (which can itself set a new high) and the last close otherwise.
 */
export function currentDrawdown(series: SeriesPoint[], runningMax: number[], live: number | null) {
  let ath = runningMax[runningMax.length - 1];
  let price = series[series.length - 1].p;
  if (live != null) {
    price = live;
    ath = Math.max(ath, live);
  }
  const value = ((price - ath) / ath) * 100;
  return { value, basis: live != null ? "Live price" : "Last close", atHigh: value >= -0.005 };
}

/** Compare-mode price panel: each ticker indexed to 100 on its own first date. */
export function normalize(series: SeriesPoint[]): number[] {
  const base = series[0]?.p ?? 1;
  return series.map((s) => (s.p / base) * 100);
}

/** Index of the point nearest to `ms` in an ascending series. */
export function nearestIdx(series: SeriesPoint[], ms: number): number {
  let lo = 0;
  let hi = series.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (series[mid].ms < ms) lo = mid + 1;
    else hi = mid;
  }
  if (lo > 0 && ms - series[lo - 1].ms < series[lo].ms - ms) return lo - 1;
  return lo;
}

// ---- Formatting (spec §5) ----

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const pad = (v: number) => String(v).padStart(2, "0");

/** Tables and cards: YYYY.MM.DD */
export function fmtDate(ms: number): string {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}.${pad(d.getUTCMonth() + 1)}.${pad(d.getUTCDate())}`;
}

/** Chart hovers: YYYY-MM-DD */
export function isoDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** Analysis-period card: YY.MM */
export function fmtYm(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getUTCFullYear()).slice(2)}.${pad(d.getUTCMonth() + 1)}`;
}

/** Chart axis ticks: "Jan 24" */
export function fmtMonth(ms: number): string {
  const d = new Date(ms);
  return `${MONTHS[d.getUTCMonth()]} ${String(d.getUTCFullYear()).slice(2)}`;
}

export function fmtNum(v: number | null | undefined, dp = 2): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return v.toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp });
}

/** Spec fmt_price: 4 dp under 10, 2 dp under 1,000, whole numbers above. */
export function fmtPrice(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  const a = Math.abs(v);
  return fmtNum(v, a < 10 ? 4 : a < 1000 ? 2 : 0);
}

/** Percent values are already ×100. */
export function fmtPct(v: number | null | undefined, signed = false): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return (signed && v >= 0 ? "+" : "") + v.toFixed(2) + "%";
}

export function fmtDays(d: number | null | undefined): string {
  if (d == null) return "—";
  return `${d.toLocaleString("en-US")} ${d === 1 ? "day" : "days"}`;
}
