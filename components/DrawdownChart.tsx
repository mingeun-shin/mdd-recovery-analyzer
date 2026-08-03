"use client";

import { useEffect, useRef, useState } from "react";
import { fmtDate, fmtMonth, money, pct, type SeriesPoint } from "@/lib/analyze";

const NEG = "#bf3a2c";
const POS = "#1a7f4b";

export type ChartAnnotation = { i: number; label: string; color: string; up: boolean };

type Props = {
  series: SeriesPoint[];
  dd: number[];
  tab: "underwater" | "price";
  annotations: ChartAnnotation[];
  currency: string;
};

export function DrawdownChart({ series, dd, tab, annotations, currency }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [chartW, setChartW] = useState(860);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver((entries) => {
      const w = Math.round(entries[0].contentRect.width);
      if (w > 0) setChartW(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const n = series.length;
  const H = 392;
  const W = Math.max(320, chartW);
  const padL = 56;
  const padR = 20;
  const padT = 40;
  const padB = 32;
  const pw = W - padL - padR;
  const ph = H - padT - padB;
  const isUW = tab === "underwater";

  const t0 = series[0]?.ms ?? 0;
  const t1 = series[n - 1]?.ms ?? 1;
  const span = Math.max(1, t1 - t0);
  const xOf = (ms: number) => padL + ((ms - t0) / span) * pw;

  let yOf: (v: number) => number;
  let yTicks: { top: number; label: string }[] = [];
  let areaBaseY: number;

  if (isUW) {
    const minDD = Math.min(0, ...dd);
    const lo = Math.min(-0.05, minDD * 1.08);
    yOf = (v: number) => padT + (v / lo) * ph;
    areaBaseY = padT;
    const stepRaw = Math.abs(lo) / 4;
    const step = stepRaw > 0.15 ? 0.2 : stepRaw > 0.07 ? 0.1 : 0.05;
    for (let v = 0; v >= lo; v -= step) yTicks.push({ top: yOf(v), label: (v * 100).toFixed(0) + "%" });
  } else {
    const vals = series.map((d) => d.p);
    const mn = Math.min(...vals);
    const mx = Math.max(...vals);
    const lmn = Math.log(mn * 0.9);
    const lmx = Math.log(mx * 1.06);
    yOf = (v: number) => padT + ph - ((Math.log(v) - lmn) / (lmx - lmn)) * ph;
    areaBaseY = padT + ph;
    for (let k = 0; k < 5; k++) {
      const v = Math.exp(lmn + (lmx - lmn) * (k / 4));
      yTicks.push({ top: yOf(v), label: money(v, currency) });
    }
  }

  const vOf = (i: number) => (isUW ? dd[i] : series[i].p);

  let line = "";
  for (let i = 0; i < n; i++) {
    line += (i ? "L" : "M") + xOf(series[i].ms).toFixed(1) + " " + yOf(vOf(i)).toFixed(1);
  }
  const area =
    line +
    "L" + xOf(t1).toFixed(1) + " " + areaBaseY.toFixed(1) +
    "L" + xOf(t0).toFixed(1) + " " + areaBaseY.toFixed(1) + "Z";

  let grid = "";
  yTicks.forEach((t) => {
    grid += "M" + padL + " " + t.top.toFixed(1) + "H" + (padL + pw).toFixed(1);
  });

  const tickCount = Math.min(7, Math.max(3, Math.round(pw / 150)));
  const xTicks: { left: number; top: number; label: string; shift: string }[] = [];
  for (let k = 0; k <= tickCount; k++) {
    const i = Math.round((k / tickCount) * (n - 1));
    xTicks.push({
      left: xOf(series[i].ms),
      top: padT + ph + 10,
      label: fmtMonth(series[i].ms),
      shift: k === 0 ? "-20%" : k === tickCount ? "-80%" : "-50%",
    });
  }

  let markerPath = "";
  annotations.forEach((a) => {
    const x = xOf(series[a.i].ms);
    markerPath += "M" + x.toFixed(1) + " " + padT + "V" + (padT + ph).toFixed(1);
  });

  const placed: { l: number; r: number; top: number }[] = [];
  const annPositions = annotations.map((a) => {
    const x = xOf(series[a.i].ms);
    const y = yOf(vOf(a.i));
    const nearL = x < padL + 90;
    const nearR = x > padL + pw - 90;
    const w = a.label.length * 6.6;
    const anchor = nearL ? 0 : nearR ? -1 : -0.5;
    const l = x + anchor * w;
    const r = l + w;
    let top = a.up ? y - 20 : y + 20;
    let guard = 0;
    while (
      guard < 4 &&
      placed.some((p) => Math.abs(p.top - top) < 15 && l < p.r + 8 && r > p.l - 8)
    ) {
      top += a.up ? -18 : 18;
      guard++;
    }
    top = Math.max(6, Math.min(padT + ph + 4, top));
    placed.push({ l, r, top });
    return { left: x, top: y, color: a.color, label: a.label, labelLeft: x, labelTop: top, shift: nearL ? "0%" : nearR ? "-100%" : "-50%" };
  });

  const hi = hoverIdx != null && hoverIdx >= 0 && hoverIdx < n ? hoverIdx : null;
  const hx = hi == null ? 0 : xOf(series[hi].ms);
  const hy = hi == null ? 0 : yOf(vOf(hi));

  function onMove(e: React.MouseEvent<HTMLDivElement>) {
    const el = wrapRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const idx = Math.round(((e.clientX - r.left - padL) / pw) * (n - 1));
    const c = Math.max(0, Math.min(n - 1, idx));
    if (c !== hoverIdx) setHoverIdx(c);
  }

  return (
    <div
      ref={wrapRef}
      onMouseMove={onMove}
      onMouseLeave={() => setHoverIdx(null)}
      className="relative w-full cursor-crosshair"
      style={{ height: H }}
    >
      <svg width={W} height={H} style={{ display: "block", overflow: "visible" }}>
        <path d={grid} stroke="#f0f0f0" strokeWidth={1} fill="none" />
        <path d={area} fill={isUW ? "rgba(191,58,44,0.10)" : "rgba(0,102,204,0.08)"} stroke="none" />
        <path d={line} fill="none" stroke={isUW ? NEG : "#0066cc"} strokeWidth={1.75} strokeLinejoin="round" strokeLinecap="round" />
        <path d={"M" + padL + " " + (isUW ? padT : padT + ph) + "H" + (padL + pw).toFixed(1)} stroke="#1d1d1f" strokeWidth={1} fill="none" />
        <path d={markerPath} stroke="#1d1d1f" strokeWidth={1} strokeDasharray="2 3" fill="none" opacity={0.35} />
        {hi != null && (
          <path d={"M" + hx.toFixed(1) + " " + padT + "V" + (padT + ph).toFixed(1)} stroke="#7a7a7a" strokeWidth={1} strokeDasharray="3 3" fill="none" />
        )}
      </svg>

      {yTicks.map((tk, idx) => (
        <div key={idx} className="absolute left-0 type-caption text-ink-muted-48" style={{ top: tk.top, transform: "translateY(-50%)" }}>
          {tk.label}
        </div>
      ))}
      {xTicks.map((tk, idx) => (
        <div key={idx} className="absolute type-caption text-ink-muted-48 whitespace-nowrap" style={{ left: tk.left, top: tk.top, transform: `translateX(${tk.shift})` }}>
          {tk.label}
        </div>
      ))}
      {annPositions.map((a, idx) => (
        <div
          key={idx}
          className="absolute rounded-full border-2 border-canvas"
          style={{ left: a.left, top: a.top, transform: "translate(-50%,-50%)", width: 9, height: 9, background: a.color, boxSizing: "content-box" }}
        />
      ))}
      {annPositions.map((a, idx) => (
        <div
          key={idx}
          className="absolute type-caption-strong whitespace-nowrap"
          style={{ left: a.labelLeft, top: a.labelTop, transform: `translateX(${a.shift})`, color: a.color }}
        >
          {a.label}
        </div>
      ))}

      {hi != null && (
        <>
          <div
            className="absolute rounded-full border-2 border-canvas"
            style={{ left: hx, top: hy, transform: "translate(-50%,-50%)", width: 8, height: 8, background: "#1d1d1f", boxSizing: "content-box" }}
          />
          <div
            className="absolute rounded-lg pointer-events-none"
            style={{
              left: hx,
              top: 16,
              transform: `translateX(${hx > padL + pw * 0.65 ? "-100%" : hx < padL + pw * 0.2 ? "0%" : "-50%"})`,
              background: "#1d1d1f",
              color: "#fff",
              padding: "10px 14px",
              minWidth: 150,
            }}
          >
            <div className="type-caption" style={{ opacity: 0.7 }}>{fmtDate(series[hi].ms)}</div>
            <div className="type-body-strong" style={{ marginTop: 4, color: "#fff" }}>{money(series[hi].p, currency)}</div>
            <div className="type-caption mt-1" style={{ color: dd[hi] <= -0.0005 ? "#ff8a7a" : "#7ee2b0" }}>
              {dd[hi] <= -0.0005 ? pct(dd[hi]) : "0.0%"} from running peak
            </div>
          </div>
        </>
      )}
    </div>
  );
}
