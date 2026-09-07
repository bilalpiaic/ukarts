import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import "./globals.css";
import { AppShell } from "./app-shell";
import { getSession } from "@/lib/auth";

export const metadata: Metadata = {
  title: "U.K Arts ERP",
  description: "Textile ERP — Inventory, Production and Double-Entry Accounting",
  icons: { icon: [{ url: "/logo.svg" }, { url: "/logo.png", type: "image/png" }] },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  const embed = (await headers()).get("x-ukarts-embed") === "1";

  return (
    <html lang="en">
      <body>
        {session && !embed ? (
          <AppShell username={session.username} role={session.role}>
            {children}
          </AppShell>
        ) : (
          children
        )}
      </body>
    </html>
  );
}
