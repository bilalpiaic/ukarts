"use client";

import { useRouter } from "next/navigation";
import type { MouseEvent } from "react";

export interface NavLink {
  href: string;
  label: string;
  group: string;
}

export const MODULE_LINKS: NavLink[] = [
  { href: "/", label: "Overview", group: "Home" },
  { href: "/purchasing", label: "Purchasing", group: "Operations" },
  { href: "/production", label: "Production", group: "Operations" },
  { href: "/processing", label: "Processing", group: "Operations" },
  { href: "/stitching", label: "Stitching", group: "Operations" },
  { href: "/sales", label: "Sales", group: "Operations" },
  { href: "/vouchers", label: "Vouchers", group: "Accounting" },
  { href: "/reports", label: "Reports", group: "Accounting" },
];

export const ADMIN_LINKS: NavLink[] = [
  { href: "/coa", label: "Chart of Accounts", group: "Accounting" },
  { href: "/settings", label: "Settings", group: "System" },
];

function linkActive(href: string, activeHref: string): boolean {
  if (href === "/") return activeHref === "/";
  return activeHref === href || activeHref.startsWith(`${href}/`);
}

function grouped(links: NavLink[]): { group: string; items: NavLink[] }[] {
  const order: string[] = [];
  const map = new Map<string, NavLink[]>();
  for (const l of links) {
    if (!map.has(l.group)) {
      map.set(l.group, []);
      order.push(l.group);
    }
    map.get(l.group)!.push(l);
  }
  return order.map((group) => ({ group, items: map.get(group)! }));
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
  const sections = grouped(links);

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
    <nav className="nav no-print" aria-label="Main">
      <div className="nav-brand">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.png" alt="U.K Arts" className="nav-logo" width={36} height={36} />
        <div>
          <div className="brand-title">U.K Arts</div>
          <div className="brand-sub">ERP · Accounting</div>
        </div>
      </div>
      <div className="nav-links">
        {sections.map((section) => (
          <div className="nav-section" key={section.group}>
            <div className="nav-group-label">{section.group}</div>
            {section.items.map((l) => {
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
