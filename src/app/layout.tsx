import type { Metadata } from "next";
import "./globals.css";
import { Nav } from "./nav";
import { getSession } from "@/lib/auth";

export const metadata: Metadata = {
  title: "U.K Arts ERP",
  description: "Textile ERP — Inventory, Production and Double-Entry Accounting",
  icons: { icon: "/logo.svg" },
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  return (
    <html lang="en">
      <body>
        {session && (
          <Nav username={session.username} role={session.role} />
        )}
        {children}
      </body>
    </html>
  );
}
