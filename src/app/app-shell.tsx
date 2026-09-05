"use client";

import { usePathname } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Nav, MODULE_LINKS, ADMIN_LINKS, type NavLink } from "./nav";

function allLinks(role: string): NavLink[] {
  return role === "ADMIN" ? [...MODULE_LINKS, ...ADMIN_LINKS] : MODULE_LINKS;
}

function moduleKey(pathname: string, links: NavLink[]): string {
  if (pathname === "/workspace") return "/";
  const exact = links.find((l) => l.href === pathname);
  if (exact) return exact.href;
  const nested = links
    .filter((l) => l.href !== "/" && (pathname === l.href || pathname.startsWith(`${l.href}/`)))
    .sort((a, b) => b.href.length - a.href.length)[0];
  return nested?.href ?? pathname;
}

function labelFor(href: string, links: NavLink[]): string {
  return links.find((l) => l.href === href)?.label ?? href;
}

function embedSrc(href: string): string {
  const url = href.startsWith("/") ? href : `/${href}`;
  return url.includes("?") ? `${url}&embed=1` : `${url}?embed=1`;
}

interface Tab {
  key: string;
  label: string;
  src: string;
}

export function AppShell({
  username,
  role,
  children,
}: {
  username: string;
  role: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname() || "/";
  const links = useMemo(() => allLinks(role), [role]);
  const initialKey = moduleKey(pathname, links);

  const [embedded, setEmbedded] = useState(false);
  const [tabs, setTabs] = useState<Tab[]>(() => [
    { key: initialKey, label: labelFor(initialKey, links), src: embedSrc(pathname) },
  ]);
  const [active, setActive] = useState(initialKey);

  useEffect(() => {
    setEmbedded(window.self !== window.top);
  }, []);

  const openTab = useCallback(
    (href: string) => {
      const key = moduleKey(href, links);
      setTabs((current) => {
        if (current.some((t) => t.key === key)) return current;
        return [...current, { key, label: labelFor(key, links), src: embedSrc(href) }];
      });
      setActive(key);
      window.history.replaceState(null, "", href);
    },
    [links],
  );

  const closeTab = useCallback((href: string) => {
    setTabs((current) => {
      if (current.length <= 1) return current;
      const next = current.filter((t) => t.key !== href);
      const fallback = next[next.length - 1];
      setActive((prev) => {
        if (prev !== href) return prev;
        if (fallback) window.history.replaceState(null, "", fallback.key);
        return fallback?.key ?? prev;
      });
      return next;
    });
  }, []);

  useEffect(() => {
    function onPop() {
      const path = window.location.pathname || "/";
      openTab(path);
    }
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [openTab]);

  if (embedded) return <>{children}</>;

  return (
    <div className="app-shell">
      <Nav
        username={username}
        role={role}
        activeHref={active}
        openHrefs={tabs.map((t) => t.key)}
        onOpen={openTab}
        onClose={closeTab}
      />
      <div className="app-shell-body">
        {tabs.map((t) => (
          <iframe
            key={t.key}
            src={t.src}
            title={t.label}
            className="ws-frame"
            style={{ display: t.key === active ? "block" : "none" }}
          />
        ))}
        {tabs.length === 0 ? children : null}
      </div>
    </div>
  );
}
