"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

/**
 * Not in lib.dom — `beforeinstallprompt` is a Chromium extension to the spec.
 */
type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const DISMISSED_KEY = "dd:install-prompt-dismissed";

type ClientEnv = {
  isIOS: boolean;
  isStandalone: boolean;
  wasDismissed: boolean;
};

/** Nothing renders during SSR — none of this is knowable on the server. */
const SERVER_ENV: ClientEnv = { isIOS: false, isStandalone: true, wasDismissed: true };

let cachedEnv: ClientEnv | null = null;

/**
 * Read once and memoised, because useSyncExternalStore re-invokes the getter
 * on every render and demands a stable reference. None of these values change
 * within a page load; dismissal after mount is tracked in component state.
 */
function getClientEnv(): ClientEnv {
  if (cachedEnv) return cachedEnv;

  const isIPhone = /iPad|iPhone|iPod/.test(navigator.userAgent) && !("MSStream" in window);
  // iPadOS 13+ reports as a Mac; a touch-capable "Mac" is really an iPad.
  const isIPadOS = navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;

  let wasDismissed = false;
  try {
    wasDismissed = window.localStorage.getItem(DISMISSED_KEY) === "1";
  } catch {
    /* private mode — just ask again */
  }

  cachedEnv = {
    isIOS: isIPhone || isIPadOS,
    // iOS reports installed state through a non-standard navigator flag
    // rather than the display-mode media query.
    isStandalone:
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as Navigator & { standalone?: boolean }).standalone === true,
    wasDismissed,
  };
  return cachedEnv;
}

const subscribeToNothing = () => () => {};

/**
 * Invites the user to install the app to their home screen.
 *
 * Two paths, because there is no single cross-platform one. Chromium fires
 * `beforeinstallprompt`, which lets us drive a real install button. Safari on
 * iOS fires nothing and exposes no API, so the only option there is telling
 * the user where the Share menu item is. The Next.js PWA guide cautions
 * against relying on `beforeinstallprompt` alone for exactly this reason;
 * pairing it with the iOS instructions covers both.
 *
 * Renders nothing when the app already runs standalone, or once dismissed.
 */
export function InstallPrompt() {
  const env = useSyncExternalStore(subscribeToNothing, getClientEnv, () => SERVER_ENV);
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(false);

  const inert = env.isStandalone || env.wasDismissed || dismissed;

  useEffect(() => {
    if (inert || env.isIOS) return;

    function onBeforeInstallPrompt(e: Event) {
      // Suppress Chromium's own mini-infobar so ours is the only prompt.
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    }

    function onInstalled() {
      setDismissed(true);
    }

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, [inert, env.isIOS]);

  function dismiss() {
    setDismissed(true);
    try {
      window.localStorage.setItem(DISMISSED_KEY, "1");
    } catch {
      /* private mode; it'll just ask again next visit */
    }
  }

  async function install() {
    if (!deferred) return;
    await deferred.prompt();
    await deferred.userChoice;
    setDeferred(null);
    dismiss();
  }

  // On iOS there's no install event to wait for, so the hint shows straight
  // away. Everywhere else, wait until the browser tells us it's installable.
  if (inert || (!env.isIOS && !deferred)) return null;

  return (
    <aside className="mt-10 rounded-lg border border-hairline bg-canvas p-5 flex flex-col sm:flex-row sm:items-center gap-4">
      <div className="flex-1">
        <p className="type-body-strong">Add to your home screen</p>
        <p className="type-caption text-ink-muted-80 mt-1 text-pretty">
          {env.isIOS ? (
            <>
              Tap the Share button in Safari, then <strong>Add to Home Screen</strong> — it
              opens full screen, without browser chrome.
            </>
          ) : (
            <>Opens full screen, without browser chrome, and works offline for saved tickers.</>
          )}
        </p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {!env.isIOS && (
          <button
            type="button"
            onClick={install}
            className="h-9 px-4 rounded-pill bg-primary text-on-primary type-caption-strong"
          >
            Install
          </button>
        )}
        <button
          type="button"
          onClick={dismiss}
          className="h-9 px-4 rounded-pill type-caption-strong text-ink-muted-48"
        >
          Not now
        </button>
      </div>
    </aside>
  );
}
