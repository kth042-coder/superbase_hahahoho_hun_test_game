import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { SITE } from "@/config";
import "./globals.css";

/** 나눔스퀘어 (OFL) — PRD 9.4 */
const nanum = localFont({
  src: [
    { path: "./fonts/NanumSquareR.woff2", weight: "400", style: "normal" },
    { path: "./fonts/NanumSquareB.woff2", weight: "700", style: "normal" },
    { path: "./fonts/NanumSquareEB.woff2", weight: "800", style: "normal" },
  ],
  display: "swap",
  variable: "--font-nanum",
  preload: false,
  fallback: ["Apple SD Gothic Neo", "Malgun Gothic", "sans-serif"],
});

export const metadata: Metadata = {
  title: `${SITE.title} — ${SITE.tagline}`,
  description: SITE.description,
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#ece9de",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" className={nanum.variable}>
      <body>{children}</body>
    </html>
  );
}
