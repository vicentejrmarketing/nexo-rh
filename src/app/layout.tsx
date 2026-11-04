import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "NEXO RH", template: "%s · NEXO RH" },
  description: "Recrutamento e seleção da equipe NEXO RH",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#111216",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pt-BR" className={`${GeistSans.variable} ${GeistMono.variable} h-full`}>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
