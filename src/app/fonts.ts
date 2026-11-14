// Self-hosted, Latin-subset variable fonts (ADR 0002). Files are vendored in ./fonts with their
// OFL licences; next/font/local serves them from our own origin (no third-party request).
import localFont from "next/font/local";

export const inter = localFont({
  src: "./fonts/Inter-latin-wght.woff2",
  variable: "--font-inter",
  display: "swap",
  weight: "100 900",
  adjustFontFallback: "Arial",
});

export const plusJakarta = localFont({
  src: "./fonts/PlusJakartaSans-latin-wght.woff2",
  variable: "--font-jakarta",
  display: "swap",
  weight: "200 800",
  adjustFontFallback: "Arial",
});
