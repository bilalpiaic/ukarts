import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "U.K Arts ERP",
  description: "Textile ERP — Inventory, Production and Double-Entry Accounting",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
