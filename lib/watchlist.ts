"use client";

import { useSyncExternalStore } from "react";

export const WATCHLIST_MAX = 10;
const DEFAULT_WATCHLIST = ["SPY", "QQQ"];

const STORAGE_KEY = "dd:watchlist";
const listeners = new Set<() => void>();

export type AddResult = "added" | "empty" | "duplicate" | "full";

/**
 * A plain array of uppercase tickers, in the order they were added. Earlier
 * builds stored `{ ticker, addedAt }` objects under the same key, so those are
 * read too. Missing or corrupt storage falls back to the defaults.
 */
function read(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw == null) return DEFAULT_WATCHLIST;
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return DEFAULT_WATCHLIST;
    const out: string[] = [];
    for (const item of parsed) {
      const t = String(typeof item === "object" && item ? (item as { ticker?: unknown }).ticker ?? "" : item)
        .trim()
        .toUpperCase();
      if (t && !out.includes(t)) out.push(t);
    }
    return out.slice(0, WATCHLIST_MAX);
  } catch {
    return DEFAULT_WATCHLIST;
  }
}

// useSyncExternalStore needs a stable snapshot between changes, so the parsed
// list is memoised and only dropped when this tab writes or another tab does.
let snapshot: string[] | null = null;
const SERVER_SNAPSHOT: string[] = [];

function getSnapshot(): string[] {
  if (snapshot == null) snapshot = read();
  return snapshot;
}

function subscribe(onChange: () => void) {
  const onStorage = (e: StorageEvent) => {
    if (e.key !== STORAGE_KEY && e.key !== null) return;
    snapshot = null;
    onChange();
  };
  listeners.add(onChange);
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onStorage);
  };
}

function write(tickers: string[]) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(tickers));
  } catch {
    // Private mode / blocked storage: the list just won't persist.
  }
  snapshot = tickers;
  listeners.forEach((l) => l());
}

export function useWatchlist() {
  const tickers = useSyncExternalStore(subscribe, getSnapshot, () => SERVER_SNAPSHOT);

  function has(ticker: string) {
    return tickers.includes(ticker.trim().toUpperCase());
  }

  function add(ticker: string): AddResult {
    const t = ticker.trim().toUpperCase();
    if (!t) return "empty";
    const current = getSnapshot();
    if (current.includes(t)) return "duplicate";
    if (current.length >= WATCHLIST_MAX) return "full";
    write([...current, t]);
    return "added";
  }

  function remove(ticker: string) {
    const t = ticker.trim().toUpperCase();
    write(getSnapshot().filter((x) => x !== t));
  }

  return { tickers, has, add, remove, full: tickers.length >= WATCHLIST_MAX };
}
