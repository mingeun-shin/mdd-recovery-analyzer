import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { ServiceWorkerRegistrar } from "@/components/ServiceWorkerRegistrar";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["300", "400", "600", "700"],
});

export const metadata: Metadata = {
  title: "Drawdown Analyzer",
  description: "See how far a stock fell and how long it took to come back.",
  applicationName: "Drawdown",
  appleWebApp: {
    capable: true,
    title: "Drawdown",
    // The nav bar is surface-black, so a translucent status bar lets it run
    // edge to edge under the notch instead of leaving a white strip.
    statusBarStyle: "black-translucent",
  },
  formatDetection: {
    // Stops iOS Safari from turning tickers and dates into tappable links.
    telephone: false,
  },
};

/**
 * `themeColor` and `viewport` live in their own export in this version of
 * Next — they are no longer valid fields on `metadata`.
 */
export const viewport: Viewport = {
  themeColor: "#000000",
  width: "device-width",
  initialScale: 1,
  // Required for the safe-area-inset-* env vars to report real values under
  // the notch and home indicator. Paired with the padding in globals.css.
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        {children}
        <ServiceWorkerRegistrar />
      </body>
    </html>
  );
}
