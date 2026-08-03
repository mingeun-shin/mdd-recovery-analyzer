"use client";

import { useEffect, useState } from "react";

export type WatchlistEntry = { ticker: string; addedAt: number };

const STORAGE_KEY = "dd:watchlist";
const listeners = new Set<() => void>();

function read(): WatchlistEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function write(entries: WatchlistEntry[]) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  listeners.forEach((l) => l());
}

export function useWatchlist() {
  const [entries, setEntries] = useState<WatchlistEntry[]>([]);

  useEffect(() => {
    setEntries(read());
    const onChange = () => setEntries(read());
    listeners.add(onChange);
    window.addEventListener("storage", onChange);
    return () => {
      listeners.delete(onChange);
      window.removeEventListener("storage", onChange);
    };
  }, []);

  function has(ticker: string) {
    return entries.some((e) => e.ticker === ticker.toUpperCase());
  }

  function add(ticker: string) {
    const t = ticker.toUpperCase();
    if (has(t)) return;
    write([...read(), { ticker: t, addedAt: Date.now() }]);
  }

  function remove(ticker: string) {
    const t = ticker.toUpperCase();
    write(read().filter((e) => e.ticker !== t));
  }

  function toggle(ticker: string) {
    has(ticker) ? remove(ticker) : add(ticker);
  }

  return { entries, has, add, remove, toggle };
}
