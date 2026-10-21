"use client";

import { useState } from "react";
import { fmtDays, type RecoveryBucket } from "@/lib/analyze";

export type RecoveryGroup = { ticker: string; color: string; buckets: RecoveryBucket[] };

const PLOT_H = 240;
const AXIS_W = 52;

function niceStep(max: number): number {
  const raw = max / 4;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const norm = raw / mag;
  return (norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10) * mag;
}

/**
 * Chart 2 of the spec: mean trough → recovery days per 5%p depth bucket. With
 * two tickers the bars group over the union of both tickers' buckets; a ticker
 * with no episodes in a bucket gets an empty (0/0) bar there.
 */
export function RecoveryChart({ groups }: { groups: RecoveryGroup[] }) {
  const [hover, setHover] = useState<{ col: number; k: number } | null>(null);
  const compare = groups.length > 1;

  const byLo = new Map<number, { lo: number; label: string }>();
  groups.forEach((g) => g.buckets.forEach((b) => byLo.set(b.lo, { lo: b.lo, label: b.label })));
  const cols = [...byLo.values()].sort((a, b) => a.lo - b.lo);

  const cell = (g: RecoveryGroup, lo: number) =>
    g.buckets.find((b) => b.lo === lo) ?? { avgDays: null, recovered: 0, count: 0 };

  const maxDays = Math.max(0, ...groups.flatMap((g) => g.buckets.map((b) => b.avgDays ?? 0)));
  const yMax = maxDays > 0 ? maxDays * 1.25 : 10;
  const step = niceStep(yMax);
  const ticks: number[] = [];
  for (let v = 0; v <= yMax; v += step) ticks.push(v);
  const yOf = (v: number) => PLOT_H - (v / yMax) * PLOT_H;

  const colMin = compare ? 128 : 76;

  return (
    <div>
      {compare && (
        <div className="flex gap-5 mb-4 flex-wrap">
          {groups.map((g) => (
            <span key={g.ticker} className="flex items-center gap-2 type-caption-strong">
              <span className="inline-block w-3 h-3 rounded-[3px]" style={{ background: g.color }} />
              {g.ticker}
            </span>
          ))}
        </div>
      )}

      <div className="overflow-x-auto">
        <div className="relative" style={{ minWidth: AXIS_W + cols.length * colMin, paddingLeft: AXIS_W }}>
          <div className="relative" style={{ height: PLOT_H }}>
            {ticks.map((v) => (
              <div key={v} className="absolute inset-x-0" style={{ top: yOf(v) }}>
                <div className={`border-t ${v === 0 ? "border-ink" : "border-divider-soft"}`} />
                <span
                  className="absolute type-caption text-ink-muted-48 tabular-nums whitespace-nowrap"
                  style={{ left: -AXIS_W, top: 0, transform: "translateY(-50%)" }}
                >
                  {Math.round(v).toLocaleString("en-US")}d
                </span>
              </div>
            ))}

            <div className="absolute inset-0 flex">
              {cols.map((c, col) => (
                <div key={c.lo} className="flex-1 flex items-end justify-center gap-[2px] px-2">
                  {groups.map((g, k) => {
                    const b = cell(g, c.lo);
                    const h = b.avgDays == null ? 0 : PLOT_H - yOf(b.avgDays);
                    const active = hover?.col === col && hover.k === k;
                    return (
                      <div
                        key={g.ticker}
                        className="relative flex-1 max-w-[56px] h-full flex flex-col justify-end items-center"
                        onPointerEnter={() => setHover({ col, k })}
                        onPointerLeave={() => setHover(null)}
                      >
                        <div className="text-center whitespace-nowrap mb-1.5 type-fine-print tabular-nums">
                          <div className="type-caption-strong text-ink">
                            {/* "None" rather than "No recovery": it has to fit over a ~55px
                                bar without running into the neighbouring label. */}
                            {b.avgDays == null ? "None" : `${Math.round(b.avgDays).toLocaleString("en-US")}d`}
                          </div>
                          <div className="text-ink-muted-48">
                            ({b.recovered}/{b.count})
                          </div>
                        </div>
                        <div
                          className="w-full rounded-t-[4px]"
                          style={{ height: h, background: g.color, opacity: hover && !active ? 0.55 : 1 }}
                        />
                        {active && (
                          <div
                            className="absolute z-10 rounded-lg pointer-events-none whitespace-nowrap"
                            style={{ bottom: h + 44, left: "50%", transform: "translateX(-50%)", background: "#1d1d1f", color: "#fff", padding: "8px 12px" }}
                          >
                            <div className="type-caption" style={{ opacity: 0.7 }}>
                              {compare ? `${g.ticker} · ` : ""}
                              {c.label} drawdowns
                            </div>
                            <div className="type-caption-strong" style={{ color: "#fff" }}>
                              {b.avgDays == null ? "None recovered yet" : `Avg. ${fmtDays(Math.round(b.avgDays))} to recover`}
                            </div>
                            <div className="type-caption" style={{ opacity: 0.7 }}>
                              {b.recovered} of {b.count} recovered
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>

          <div className="flex pt-2">
            {cols.map((c) => (
              <div key={c.lo} className="flex-1 text-center type-caption text-ink-muted-48 whitespace-nowrap">
                {c.label}
              </div>
            ))}
          </div>
          <div className="text-center type-caption text-ink-muted-48 mt-2">Drawdown depth (% below peak)</div>
        </div>
      </div>
    </div>
  );
}
