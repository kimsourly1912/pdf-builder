import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PDF Studio — Edit PDFs in your browser",
  description:
    "Edit, sign, extract content, annotate, export, and convert PDFs to self-contained HTML privately in your browser.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
  other: {
    "codex-preview": "development",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
