"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/", label: "Overview" },
  { href: "/purchasing", label: "Purchasing" },
  { href: "/production", label: "Production" },
  { href: "/processing", label: "Processing" },
  { href: "/stitching", label: "Stitching" },
  { href: "/sales", label: "Sales" },
];

export function Nav() {
  const pathname = usePathname();
  return (
    <nav className="nav">
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
    </nav>
  );
}
