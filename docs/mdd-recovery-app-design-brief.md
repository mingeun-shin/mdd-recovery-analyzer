# Design Brief: Stock Drawdown & Recovery Analyzer
*Handoff doc for UI prototyping — MVP scope*

---

## 1. One-Line Summary
A web app where a long-term investor enters a stock ticker and a date range, and instantly sees that stock's **Maximum Drawdown (MDD)** and **recovery time**, visualized clearly — no finance jargon, no clutter.

## 2. Who It's For & Why
Long-term retail investors who hold individual stocks and want to understand *how bad it got* and *how long it took to come back* — for a position they own, over a timeframe they choose. This kind of analysis normally requires professional tools (Bloomberg terminals) or manual spreadsheet work. Retail investors currently have no simple, visual, self-serve way to see this for a specific stock and date range.

**Core emotional job:** turn an abstract risk concept into something the user can *see* and *feel* — "this stock fell 42% and took 18 months to recover" should land instantly, the way a single striking chart does.

## 3. MVP Scope

**In scope:**
- Single stock ticker input (search/autocomplete)
- Custom date range selector (start date / end date)
- Calculate & display: Maximum Drawdown (%), peak date, trough date, recovery date (or "still recovering" state), recovery duration
- Underwater equity curve chart (price relative to running peak, over time)
- Clear "recovered" vs "still underwater" status

**Explicitly out of scope for MVP** (design should leave room, not build now):
- User accounts / login
- Saved watchlists or portfolios
- Multi-stock comparison
- Benchmark overlay (e.g., vs. S&P 500)
- Push notifications / alerts
- Native iOS-specific UI (this is a responsive web app first)

## 4. Core User Flow

1. **Landing / input state** — user lands on a clean screen with a ticker search field and a date range picker. Minimal else on screen.
2. **Loading state** — brief, while data is fetched/calculated.
3. **Results state** — the main event. Big, legible headline numbers (MDD %, recovery time) plus the underwater chart below.
4. **Edge/error states** — invalid ticker, no data in selected range, date range too short, stock never recovered within range (still underwater as of today).

Design should treat the **results screen as the hero** — that's where the "aha" moment lives.

## 5. Screens Needed

| Screen | Purpose |
|---|---|
| Home / Input | Ticker search + date range picker, primary CTA to calculate |
| Results | Headline metrics + underwater chart + peak/trough/recovery dates |
| Loading | Lightweight, shouldn't feel like a stall |
| Empty/Error | Invalid ticker, insufficient data, etc. |

## 6. Key Metrics — Definitions (for correct labeling in the UI)

- **Maximum Drawdown (MDD):** the largest peak-to-trough decline in the stock's price within the selected date range, shown as a percentage (e.g., "-42.3%").
- **Peak date / Trough date:** the specific dates marking the start and bottom of that decline.
- **Recovery time:** the time from the trough back to a new all-time high (within the range, or up to today). If the stock hasn't recovered yet, show a clear "still underwater — X% below peak, Y days and counting" state rather than a blank or broken field.
- **Recovery rate:** open naming question — could mean (a) *how long* recovery took (duration, the current default assumption), or (b) *how much of the loss has been recovered so far* (%, useful for the still-underwater case). Suggest designing for **both**: a duration stat when fully recovered, and a "% recovered so far" stat when not.

## 7. Design Direction

- **Tone:** clean, calm, data-forward fintech — think less "trading app adrenaline," more "trustworthy financial insight." The user is here to understand pain, not chase it.
- **Color logic:** reserve a clear negative color (red/orange) for drawdown depth, and a positive color (green) for recovery — but keep the palette otherwise restrained/neutral so the chart's color-coding actually stands out.
- **Typography hierarchy:** the MDD % and recovery time should be the most visually dominant elements on the results screen — big numbers, minimal competing UI.
- **Chart:** the underwater equity curve (% below running peak, over time) is the centerpiece visual — should read clearly at a glance, ideally with the peak/trough/recovery points annotated directly on it.
- **Mobile-first, responsive:** this will eventually become an iOS app, so design for a narrow viewport first and scale up, rather than the reverse.

## 8. Inputs & Outputs Summary (for wireframing)

**Inputs:**
- Ticker symbol (text input w/ autocomplete ideally)
- Start date
- End date

**Outputs (results screen):**
- MDD (%)
- Peak date
- Trough date
- Recovery date / "still underwater" status
- Recovery duration (or % recovered so far)
- Underwater equity curve chart

## 9. Open Questions for Design to Flag (not blockers, just worth surfacing)
- How should "recovery rate" be visually distinguished when a stock is still underwater vs. fully recovered? (two distinct result states)
- Should the date range picker support presets (1Y, 5Y, Max) alongside custom dates, or custom-only for MVP?
- Any appetite for a lightweight "share this result" view, even if not functional in MVP?

---
*Prepared as a handoff for UI prototyping. Functionality (data fetching, calculations) is being built separately as a web app MVP.*
