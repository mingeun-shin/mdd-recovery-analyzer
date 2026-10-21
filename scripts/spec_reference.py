"""Independent reference for the drawdown math in lib/analyze.ts.

A plain-Python transcription of MDD_APP_SPEC.md §3 (compute_mdd,
compute_episodes, bucket_recovery), run over a synthetic price series and
written to lib/__fixtures__/synthetic.json. lib/analyze.test.ts checks the
TypeScript port against that file, so the two implementations have to agree
on every peak, trough, recovery date, depth and bucket average.

The series is generated rather than downloaded: committing real market data
would mean redistributing a vendor's prices. A fixed seed keeps it
reproducible, and it is shaped to hit the interesting cases: weekend gaps
(calendar days ≠ trading days), dozens of small dips, two crashes that
recover, and an unrecovered drawdown at the end. Exact ties with a prior
high are covered by the hand-written cases in lib/analyze.test.ts instead.

Run from the repo root:  python3 scripts/spec_reference.py
"""

import json
import math
import os
from datetime import date, timedelta

SEED = 20261021
N = 2500
OUT = os.path.join(os.path.dirname(__file__), "..", "lib", "__fixtures__", "synthetic.json")


def lcg(seed):
    # Numerical Recipes constants; deterministic across Python versions,
    # unlike random.Random's internals.
    state = seed
    while True:
        state = (1664525 * state + 1013904223) % 2**32
        yield (state + 0.5) / 2**32


def make_series():
    u = lcg(SEED)
    d = date(2000, 1, 3)
    price = 100.0
    points = []
    while len(points) < N:
        if d.weekday() < 5:
            i = len(points)
            # Box–Muller for a normal shock.
            z = math.sqrt(-2 * math.log(next(u))) * math.cos(2 * math.pi * next(u))
            drift = 0.0006
            if 600 <= i < 800:
                drift = -0.0015  # a slow bear market
            elif 1500 <= i < 1530:
                drift = -0.008  # a sharp crash
            elif i >= N - 150:
                drift = -0.0015  # still falling when the data ends
            price *= math.exp(drift + 0.012 * z)
            points.append({"t": d.isoformat(), "c": round(price, 2)})
        d += timedelta(days=1)
    return points


def analyze(points):
    dates = [date.fromisoformat(p["t"]) for p in points]
    prices = [p["c"] for p in points]
    n = len(prices)

    # §3.1 running peak and drawdown, §3.2 compute_mdd
    rm, m = [], float("-inf")
    for v in prices:
        m = max(m, v)
        rm.append(m)
    dd = [(prices[i] - rm[i]) / rm[i] * 100 for i in range(n)]
    tr = dd.index(min(dd))
    peak_val = rm[tr]
    pk = max(i for i in range(tr + 1) if prices[i] == peak_val)
    rec = next((i for i in range(tr + 1, n) if prices[i] >= peak_val), None)

    # §3.3 compute_episodes
    eps, cp, in_dd, ct = [], 0, False, None
    for i in range(1, n):
        if prices[i] >= prices[cp]:
            if in_dd:
                eps.append((cp, ct, i))
                in_dd, ct = False, None
            cp = i
        else:
            if not in_dd:
                in_dd, ct = True, i
            elif prices[i] < prices[ct]:
                ct = i
    if in_dd:
        eps.append((cp, ct, None))
    eps = [(p, t, r, (prices[t] - prices[p]) / prices[p] * 100) for p, t, r in eps]
    eps = sorted([e for e in eps if e[3] < -0.005], key=lambda e: e[3])

    # §3.4 bucket_recovery
    buckets = []
    if eps:
        max_depth = max(abs(e[3]) for e in eps)
        n_buckets = int((max_depth - 1e-9) // 5) + 1
        for i in range(n_buckets):
            lo, hi = 5 * i, 5 * (i + 1)
            group = [e for e in eps if lo <= abs(e[3]) < hi]
            if not group:
                continue
            recovered = [e for e in group if e[2] is not None]
            avg = (sum((dates[e[2]] - dates[e[1]]).days for e in recovered) / len(recovered)
                   if recovered else None)
            buckets.append({"lo": lo, "hi": hi, "count": len(group), "recovered": len(recovered),
                            "avgDays": None if avg is None else round(avg, 6)})

    day = lambda i: None if i is None else points[i]["t"]
    return {
        "mdd": round(dd[tr], 6),
        "peak": day(pk),
        "trough": day(tr),
        "recovery": day(rec),
        "peakVal": round(peak_val, 6),
        "episodes": [{"peak": day(p), "trough": day(t), "recovery": day(r), "depth": round(x, 6)}
                     for p, t, r, x in eps],
        "buckets": buckets,
    }


if __name__ == "__main__":
    points = make_series()
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w") as f:
        json.dump({"seed": SEED, "points": points, "expected": analyze(points)}, f, separators=(",", ":"))
        f.write("\n")
    print(f"wrote {os.path.relpath(OUT)}: {len(points)} points")
