import type { MetadataRoute } from "next";

/**
 * Web app manifest — what makes the site installable to a phone home screen.
 *
 * `display: "standalone"` is the part that matters: launched from the home
 * screen the app opens without browser chrome, which is most of what people
 * actually mean when they ask for "the app". Colours are the design system's
 * surface-black / canvas tokens so the splash screen and status bar match the
 * global nav rather than flashing white.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Drawdown Analyzer",
    short_name: "Drawdown",
    description: "See how far a stock fell and how long it took to come back.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    // Deliberately not locked to portrait: the underwater chart is the point
    // of the app, and rotating to landscape is how people read a chart on a
    // phone. The safe-area padding handles the landscape notch.
    background_color: "#000000",
    theme_color: "#000000",
    categories: ["finance", "productivity"],
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      // Inset copy, so platforms that crop icons to a circle or squircle
      // clip the padding instead of the curve.
      {
        src: "/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    shortcuts: [
      {
        name: "Watchlist",
        short_name: "Watchlist",
        url: "/watchlist",
      },
    ],
  };
}
