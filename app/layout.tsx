import type { Metadata, Viewport } from "next";
import "./globals.css";
export const viewport: Viewport = {
  themeColor: "#090909",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
};
export const metadata: Metadata = {
  title: "TrackBus — Transporte escolar",
  description:
    "Gestão e acompanhamento do transporte escolar. I.See Technologies.",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/icon-192.png" },
};
export default function Layout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
