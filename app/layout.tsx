import type { Metadata } from "next";
import "./globals.css";
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
