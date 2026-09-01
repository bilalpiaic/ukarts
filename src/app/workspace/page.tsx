"use client";

import { useState } from "react";

const MODULES = [
  { href: "/", label: "Overview" },
  { href: "/purchasing", label: "Purchasing" },
  { href: "/production", label: "Production" },
  { href: "/processing", label: "Processing" },
  { href: "/stitching", label: "Stitching" },
  { href: "/sales", label: "Sales" },
  { href: "/reports", label: "Reports" },
];

interface Tab {
  id: number;
  href: string;
  label: string;
}

let counter = 3;

export default function Workspace() {
  const [tabs, setTabs] = useState<Tab[]>([
    { id: 1, href: "/", label: "Overview" },
    { id: 2, href: "/production", label: "Production" },
  ]);
  const [activeId, setActiveId] = useState(1);
  const [toAdd, setToAdd] = useState(MODULES[1].href);

  function addTab() {
    const mod = MODULES.find((m) => m.href === toAdd);
    if (!mod) return;
    const id = counter++;
    setTabs((t) => [...t, { id, href: mod.href, label: mod.label }]);
    setActiveId(id);
  }

  function closeTab(id: number) {
    setTabs((t) => {
      const next = t.filter((x) => x.id !== id);
      if (id === activeId && next.length) setActiveId(next[next.length - 1].id);
      return next;
    });
  }

  return (
    <div className="container">
      <h1 className="page-title">Workspace — Multiple Tabs</h1>

      <div className="ws-tabs">
        {tabs.map((t) => (
          <div
            key={t.id}
            className={t.id === activeId ? "ws-tab active" : "ws-tab"}
            onClick={() => setActiveId(t.id)}
          >
            <span>{t.label}</span>
            <button
              className="close"
              onClick={(e) => {
                e.stopPropagation();
                closeTab(t.id);
              }}
              aria-label="Close tab"
            >
              ×
            </button>
          </div>
        ))}
        <select value={toAdd} onChange={(e) => setToAdd(e.target.value)} style={{ marginLeft: 8 }}>
          {MODULES.map((m) => (
            <option key={m.href} value={m.href}>
              {m.label}
            </option>
          ))}
        </select>
        <button type="button" onClick={addTab}>
          + Open tab
        </button>
      </div>

      {tabs.length === 0 ? (
        <div className="card">
          <p className="subtitle">No open tabs. Add one above.</p>
        </div>
      ) : (
        tabs.map((t) => (
          <iframe
            key={t.id}
            src={t.href}
            title={t.label}
            className="ws-frame"
            style={{ display: t.id === activeId ? "block" : "none" }}
          />
        ))
      )}
    </div>
  );
}
