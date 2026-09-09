import type { Metadata } from "next";
import type { ReactNode } from "react";
import { DM_Sans, DM_Mono } from "next/font/google";
import "./globals.css";

const fontUi = DM_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-dm-sans",
  display: "swap",
});

const fontData = DM_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-dm-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Tablero",
  description: "Portal personal de seguimiento",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es" className={`${fontUi.variable} ${fontData.variable}`}>
      <body>
        <div className="shell">{children}</div>
      </body>
    </html>
  );
}
