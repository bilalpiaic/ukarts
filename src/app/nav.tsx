"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

const baseLinks = [
  { href: "/", label: "Overview" },
  { href: "/purchasing", label: "Purchasing" },
  { href: "/production", label: "Production" },
  { href: "/processing", label: "Processing" },
  { href: "/stitching", label: "Stitching" },
  { href: "/sales", label: "Sales" },
  { href: "/reports", label: "Reports" },
  { href: "/workspace", label: "Workspace" },
];

const adminLinks = [
  { href: "/admin", label: "Admin" },
  { href: "/settings", label: "Settings" },
];

export function Nav({ username, role }: { username: string; role: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const links = role === "ADMIN" ? [...baseLinks, ...adminLinks] : baseLinks;

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <nav className="nav no-print">
      <div className="nav-brand">U.K Arts ERP</div>
      <div className="nav-links">
        {links.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className={pathname === l.href ? "nav-link active" : "nav-link"}
          >
            {l.label}
          </Link>
        ))}
      </div>
      <div className="nav-user">
        <span className="badge">
          {username} · {role}
        </span>
        <button className="btn-ghost" onClick={logout}>
          Logout
        </button>
      </div>
    </nav>
  );
}
