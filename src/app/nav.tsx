"use client";

import { useRouter } from "next/navigation";
import type { MouseEvent } from "react";

export interface NavLink {
  href: string;
  label: string;
}

export const MODULE_LINKS: NavLink[] = [
  { href: "/", label: "Overview" },
  { href: "/purchasing", label: "Purchasing" },
  { href: "/production", label: "Production" },
  { href: "/processing", label: "Processing" },
  { href: "/stitching", label: "Stitching" },
  { href: "/sales", label: "Sales" },
  { href: "/vouchers", label: "Vouchers" },
  { href: "/reports", label: "Reports" },
];

export const ADMIN_LINKS: NavLink[] = [
  { href: "/coa", label: "COA" },
  { href: "/settings", label: "Settings" },
];

function linkActive(href: string, activeHref: string): boolean {
  if (href === "/") return activeHref === "/";
  return activeHref === href || activeHref.startsWith(`${href}/`);
}

export function Nav({
  username,
  role,
  activeHref,
  openHrefs,
  onOpen,
  onClose,
}: {
  username: string;
  role: string;
  activeHref: string;
  openHrefs: string[];
  onOpen: (href: string) => void;
  onClose: (href: string) => void;
}) {
  const router = useRouter();
  const links = role === "ADMIN" ? [...MODULE_LINKS, ...ADMIN_LINKS] : MODULE_LINKS;

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  function onNavClick(e: MouseEvent<HTMLAnchorElement>, href: string) {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    e.preventDefault();
    onOpen(href);
  }

  return (
    <nav className="nav no-print">
      <div className="nav-brand">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.png" alt="U.K Arts" className="nav-logo" width={44} height={44} />
        <div>
          <div className="brand-title">U.K Arts</div>
          <div className="brand-sub">Cloth · Craft · Passion</div>
        </div>
      </div>
      <div className="nav-links">
        {links.map((l) => {
          const open = openHrefs.includes(l.href);
          const active = linkActive(l.href, activeHref);
          return (
            <a
              key={l.href}
              href={l.href}
              className={`nav-link${active ? " active" : ""}${open && !active ? " open" : ""}`}
              onClick={(e) => onNavClick(e, l.href)}
            >
              <span>{l.label}</span>
              {open && openHrefs.length > 1 && (
                <button
                  type="button"
                  className="nav-link-close"
                  aria-label={`Close ${l.label}`}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onClose(l.href);
                  }}
                >
                  ×
                </button>
              )}
            </a>
          );
        })}
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
