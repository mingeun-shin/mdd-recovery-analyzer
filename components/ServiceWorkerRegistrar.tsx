"use client";

import { useEffect } from "react";

/**
 * Registers the service worker that backs offline support for the installed
 * app. Renders nothing.
 *
 * Development is deliberately excluded — a service worker sitting in front of
 * Turbopack's dev assets serves stale chunks and makes hot reload behave in
 * confusing ways. To exercise it locally, run `npm run build && npm start`.
 */
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;

    navigator.serviceWorker
      .register("/sw.js", { scope: "/", updateViaCache: "none" })
      .catch(() => {
        // An unregistered worker just means no offline support — never a
        // reason to surface an error to the user.
      });
  }, []);

  return null;
}
