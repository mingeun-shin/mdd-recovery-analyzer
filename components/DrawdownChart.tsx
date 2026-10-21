"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import {
  fmtMonth,
  fmtNum,
  fmtPct,
  fmtPrice,
  isoDate,
  nearestIdx,
  normalize,
  type MddResult,
  type SeriesPoint,
} from "@/lib/analyze";

const NEG = "#bf3a2c";
const POS = "#1a7f4b";
const INK = "#1d1d1f";
const MUTED = "#7a7a7a";
const GRID = "#f0f0f0";

export type ChartItem = {
  ticker: string;
  color: string;
  series: SeriesPoint[];
  mdd: MddResult;
};

// Panel geometry. Panel 1 is price, panel 2 the underwater curve; they share
// the x scale so one crosshair reads both.
const PAD_L = 64;
const PAD_T = 30;
const H1 = 300;
const GAP = 44;
const H2 = 170;
const PAD_B = 30;
const P1_TOP = PAD_T;
const P1_BOT = P1_TOP + H1;
const P2_TOP = P1_BOT + GAP;
const P2_BOT = P2_TOP + H2;
const H = P2_BOT + PAD_B;

function niceTicks(lo: number, hi: number, count = 4): number[] {
  const span = hi - lo || Math.abs(hi) || 1;
  const raw = span / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const norm = raw / mag;
  const step = (norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10) * mag;
  const ticks: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + step * 1e-6; v += step) ticks.push(Math.abs(v) < step * 1e-6 ? 0 : v);
  return ticks;
}

function pathOf(xs: number[], ys: number[]): string {
  let d = "";
  for (let i = 0; i < xs.length; i++) d += (i ? "L" : "M") + xs[i].toFixed(1) + " " + ys[i].toFixed(1);
  return d;
}

/**
 * Chart 1 of the spec. One item draws raw adjusted closes against their
 * running peak with the gap shaded; two items switch to compare mode, where
 * each ticker is indexed to 100 on its own first date.
 */
export function DrawdownChart({ items }: { items: ChartItem[] }) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [chartW, setChartW] = useState(860);
  const [hoverMs, setHoverMs] = useState<number | null>(null);

  // Measure on attach rather than waiting for the observer's first callback,
  // so the chart never paints a frame at the 860px placeholder width.
  const attachWrap = useCallback((el: HTMLDivElement | null) => {
    wrapRef.current = el;
    if (!el) return;
    const w = Math.round(el.getBoundingClientRect().width);
    if (w > 0) setChartW(w);
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver((entries) => {
      const w = Math.round(entries[0].contentRect.width);
      if (w > 0) setChartW(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const compare = items.length > 1;
  const W = Math.max(260, chartW);
  const padR = compare ? 52 : 16;
  const pw = W - PAD_L - padR;

  const geo = useMemo(() => {
    const t0 = Math.min(...items.map((it) => it.series[0].ms));
    const t1 = Math.max(...items.map((it) => it.series[it.series.length - 1].ms));
    const span = Math.max(1, t1 - t0);
    const xOf = (ms: number) => PAD_L + ((ms - t0) / span) * pw;

    // Panel 1 values: raw price (single) or the 100-based index (compare).
    const values = items.map((it) => (compare ? normalize(it.series) : it.series.map((s) => s.p)));
    const allV = values.flat();
    const topV = compare ? allV : allV.concat(items[0].mdd.runningMax);
    let vLo = Math.min(...allV);
    let vHi = Math.max(...topV);
    const vPad = (vHi - vLo) * 0.06 || vHi * 0.05 || 1;
    vLo -= vPad;
    vHi += vPad;
    const y1 = (v: number) => P1_BOT - ((v - vLo) / (vHi - vLo)) * H1;

    const ddLo = Math.min(-5, ...items.flatMap((it) => it.mdd.dd)) * 1.08;
    const y2 = (v: number) => P2_TOP + (v / ddLo) * H2;

    const lines = items.map((it, k) => {
      const xs = it.series.map((s) => xOf(s.ms));
      const ys1 = values[k].map(y1);
      const ys2 = it.mdd.dd.map(y2);
      return { xs, ys1, ys2, price: pathOf(xs, ys1), dd: pathOf(xs, ys2) };
    });

    let peakLine = "";
    let underwater = "";
    let ddArea = "";
    if (!compare) {
      const { xs, ys1, dd } = lines[0];
      const peakYs = items[0].mdd.runningMax.map(y1);
      peakLine = pathOf(xs, peakYs);
      // Running peak forward, then price back: the enclosed band is the time
      // spent below the prior high.
      underwater = peakLine;
      for (let i = xs.length - 1; i >= 0; i--) underwater += "L" + xs[i].toFixed(1) + " " + ys1[i].toFixed(1);
      underwater += "Z";
      ddArea = dd + "L" + xs[xs.length - 1].toFixed(1) + " " + P2_TOP + "L" + xs[0].toFixed(1) + " " + P2_TOP + "Z";
    }

    const yTicks1 = niceTicks(vLo, vHi).filter((v) => v >= vLo && v <= vHi);
    const yTicks2 = niceTicks(ddLo, 0).filter((v) => v >= ddLo && v <= 0);

    const tickCount = Math.min(7, Math.max(3, Math.round(pw / 150)));
    const xTicks = Array.from({ length: tickCount + 1 }, (_, k) => {
      const ms = t0 + (k / tickCount) * span;
      return { left: xOf(ms), label: fmtMonth(ms), shift: k === 0 ? "-20%" : k === tickCount ? "-80%" : "-50%" };
    });

    let grid = "";
    yTicks1.forEach((v) => (grid += `M${PAD_L} ${y1(v).toFixed(1)}H${(PAD_L + pw).toFixed(1)}`));
    yTicks2.forEach((v) => (grid += `M${PAD_L} ${y2(v).toFixed(1)}H${(PAD_L + pw).toFixed(1)}`));

    // MDD markers (single mode only — compare mode keeps the panel to two lines).
    type Marker = { x: number; y: number; color: string; label: string; up: boolean };
    const markers: Marker[] = [];
    let ddMarker: { x: number; y: number; label: string } | null = null;
    if (!compare) {
      const { series, mdd } = items[0];
      markers.push({ x: xOf(series[mdd.peakIdx].ms), y: y1(mdd.peakVal), color: INK, label: `MDD peak ${fmtPrice(mdd.peakVal)}`, up: true });
      markers.push({ x: xOf(series[mdd.troughIdx].ms), y: y1(series[mdd.troughIdx].p), color: NEG, label: `MDD trough ${fmtPrice(series[mdd.troughIdx].p)}`, up: false });
      if (mdd.recoveryIdx != null) {
        markers.push({ x: xOf(series[mdd.recoveryIdx].ms), y: y1(series[mdd.recoveryIdx].p), color: POS, label: `Recovered ${fmtPrice(series[mdd.recoveryIdx].p)}`, up: true });
      }
      ddMarker = { x: xOf(series[mdd.troughIdx].ms), y: y2(mdd.mdd), label: `MDD ${fmtPct(mdd.mdd)}` };
    }

    // Nudge marker labels apart so the peak and recovery tags don't overprint.
    const placed: { l: number; r: number; top: number }[] = [];
    const labels = markers.map((m) => {
      const w = m.label.length * 6.8;
      const nearL = m.x < PAD_L + w / 2;
      const nearR = m.x > PAD_L + pw - w / 2;
      const l = nearL ? m.x : nearR ? m.x - w : m.x - w / 2;
      let top = m.up ? m.y - 24 : m.y + 10;
      for (let g = 0; g < 4 && placed.some((p) => Math.abs(p.top - top) < 16 && l < p.r + 8 && l + w > p.l - 8); g++) {
        top += m.up ? -18 : 18;
      }
      top = Math.max(P1_TOP - 22, Math.min(P1_BOT - 16, top));
      placed.push({ l, r: l + w, top });
      return { ...m, top, shift: nearL ? "0%" : nearR ? "-100%" : "-50%" };
    });

    // Compare mode: name each line at its right end, kept at least 16px apart.
    const endLabels = compare
      ? items
          .map((it, k) => ({ ticker: it.ticker, color: it.color, y: lines[k].ys1[lines[k].ys1.length - 1] }))
          .sort((a, b) => a.y - b.y)
          .map((e, k, arr) => {
            if (k > 0 && e.y - arr[k - 1].y < 16) e.y = arr[k - 1].y + 16;
            return e;
          })
      : [];

    return { t0, span, xOf, y1, y2, values, lines, peakLine, underwater, ddArea, yTicks1, yTicks2, xTicks, grid, labels, ddMarker, endLabels };
  }, [items, pw, compare]);

  function onMove(e: React.PointerEvent<HTMLDivElement>) {
    const el = wrapRef.current;
    if (!el) return;
    const x = e.clientX - el.getBoundingClientRect().left;
    const f = Math.max(0, Math.min(1, (x - PAD_L) / pw));
    setHoverMs(geo.t0 + f * geo.span);
  }

  const hover =
    hoverMs == null
      ? null
      : items.map((it, k) => {
          const i = nearestIdx(it.series, hoverMs);
          return { it, i, x: geo.lines[k].xs[i], y1: geo.lines[k].ys1[i], y2: geo.lines[k].ys2[i], v: geo.values[k][i], dd: it.mdd.dd[i] };
        });
  const hx = hover ? hover[0].x : 0;

  return (
    <div>
      {compare && (
        <div className="flex gap-5 mb-3 flex-wrap">
          {items.map((it) => (
            <span key={it.ticker} className="flex items-center gap-2 type-caption-strong">
              <span className="inline-block w-4 h-0.5 rounded-pill" style={{ background: it.color }} />
              {it.ticker}
            </span>
          ))}
        </div>
      )}
      <div
        ref={attachWrap}
        onPointerMove={onMove}
        onPointerLeave={() => setHoverMs(null)}
        className="relative w-full cursor-crosshair select-none"
        style={{ height: H }}
      >
        <svg width={W} height={H} style={{ display: "block", overflow: "visible" }}>
          <path d={geo.grid} stroke={GRID} strokeWidth={1} fill="none" />

          {!compare && (
            <>
              <path d={geo.underwater} fill="rgba(191,58,44,0.12)" stroke="none" />
              <path d={geo.peakLine} fill="none" stroke={MUTED} strokeWidth={1} strokeDasharray="4 3" />
              <path d={geo.ddArea} fill="rgba(191,58,44,0.10)" stroke="none" />
            </>
          )}
          {geo.lines.map((l, k) => (
            <g key={items[k].ticker}>
              <path d={l.price} fill="none" stroke={items[k].color} strokeWidth={compare ? 2 : 1.75} strokeLinejoin="round" strokeLinecap="round" />
              <path d={l.dd} fill="none" stroke={compare ? items[k].color : NEG} strokeWidth={compare ? 2 : 1.5} strokeLinejoin="round" strokeLinecap="round" />
            </g>
          ))}

          <path d={`M${PAD_L} ${P1_BOT}H${(PAD_L + pw).toFixed(1)}`} stroke={INK} strokeWidth={1} fill="none" />
          <path d={`M${PAD_L} ${P2_TOP}H${(PAD_L + pw).toFixed(1)}`} stroke={INK} strokeWidth={1} fill="none" />

          {hover && (
            <path d={`M${hx.toFixed(1)} ${P1_TOP}V${P2_BOT}`} stroke={MUTED} strokeWidth={1} strokeDasharray="3 3" fill="none" />
          )}
        </svg>

        <div className="absolute left-0 type-caption-strong" style={{ top: 0 }}>
          {compare ? "Price (indexed, start = 100)" : "Price"}
        </div>
        <div className="absolute left-0 type-caption-strong" style={{ top: P1_BOT + 14 }}>
          Drawdown (underwater)
        </div>

        {geo.yTicks1.map((v) => (
          <div key={"a" + v} className="absolute left-0 type-caption text-ink-muted-48 tabular-nums" style={{ top: geo.y1(v), transform: "translateY(-50%)" }}>
            {compare ? fmtNum(v, 0) : fmtPrice(v)}
          </div>
        ))}
        {geo.yTicks2.map((v) => (
          <div key={"b" + v} className="absolute left-0 type-caption text-ink-muted-48 tabular-nums" style={{ top: geo.y2(v), transform: "translateY(-50%)" }}>
            {v.toFixed(0)}%
          </div>
        ))}
        {geo.xTicks.map((tk, idx) => (
          <div key={idx} className="absolute type-caption text-ink-muted-48 whitespace-nowrap" style={{ left: tk.left, top: P2_BOT + 8, transform: `translateX(${tk.shift})` }}>
            {tk.label}
          </div>
        ))}

        {geo.endLabels.map((e) => (
          <div key={e.ticker} className="absolute type-caption-strong" style={{ left: PAD_L + pw + 8, top: e.y, transform: "translateY(-50%)" }}>
            {e.ticker}
          </div>
        ))}

        {geo.labels.map((m) => (
          <div
            key={m.label}
            className="absolute rounded-full border-2 border-canvas"
            style={{ left: m.x, top: m.y, transform: "translate(-50%,-50%)", width: 9, height: 9, background: m.color, boxSizing: "content-box" }}
          />
        ))}
        {geo.labels.map((m) => (
          <div key={m.label + "t"} className="absolute type-caption-strong whitespace-nowrap" style={{ left: m.x, top: m.top, transform: `translateX(${m.shift})` }}>
            {m.label}
          </div>
        ))}
        {geo.ddMarker && (
          <>
            <div
              className="absolute rounded-full border-2 border-canvas"
              style={{ left: geo.ddMarker.x, top: geo.ddMarker.y, transform: "translate(-50%,-50%)", width: 9, height: 9, background: NEG, boxSizing: "content-box" }}
            />
            <div
              className="absolute type-caption-strong whitespace-nowrap"
              style={{
                left: geo.ddMarker.x,
                top: geo.ddMarker.y,
                transform: `translate(${geo.ddMarker.x > PAD_L + pw - 110 ? "calc(-100% - 10px)" : "10px"},-50%)`,
              }}
            >
              {geo.ddMarker.label}
            </div>
          </>
        )}

        {hover && (
          <>
            {hover.map((h) => (
              <div key={h.it.ticker}>
                <div
                  className="absolute rounded-full border-2 border-canvas"
                  style={{ left: h.x, top: h.y1, transform: "translate(-50%,-50%)", width: 8, height: 8, background: h.it.color, boxSizing: "content-box" }}
                />
                <div
                  className="absolute rounded-full border-2 border-canvas"
                  style={{ left: h.x, top: h.y2, transform: "translate(-50%,-50%)", width: 8, height: 8, background: compare ? h.it.color : NEG, boxSizing: "content-box" }}
                />
              </div>
            ))}
            <div
              className="absolute rounded-lg pointer-events-none"
              style={{
                left: hx,
                top: P1_TOP + 8,
                transform: `translateX(${hx > PAD_L + pw * 0.6 ? "calc(-100% - 12px)" : "12px"})`,
                background: INK,
                color: "#fff",
                padding: "10px 14px",
                minWidth: 160,
              }}
            >
              <div className="type-caption" style={{ opacity: 0.7 }}>{isoDate(hover[0].it.series[hover[0].i].ms)}</div>
              {hover.map((h) => (
                <div key={h.it.ticker} className="mt-1.5">
                  {compare && (
                    <div className="type-caption-strong flex items-center gap-1.5" style={{ color: "#fff" }}>
                      <span className="inline-block w-2 h-2 rounded-full" style={{ background: h.it.color }} />
                      {h.it.ticker}
                    </div>
                  )}
                  <div className="type-caption tabular-nums" style={{ color: "#fff" }}>
                    {compare ? `Index ${fmtNum(h.v, 1)}` : `Close ${fmtNum(h.v, 2)}`}
                  </div>
                  <div className="type-caption tabular-nums" style={{ color: h.dd <= -0.005 ? "#ff8a7a" : "#7ee2b0" }}>
                    Drawdown {fmtPct(h.dd)}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
