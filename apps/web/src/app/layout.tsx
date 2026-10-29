import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "The Canvasium",
  description: "A universal canvas for turning ideas into documents, dashboards, and visual workspaces.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
