"use client";

import { useEffect, useMemo, useRef, useState } from "react";

export interface Option {
  value: string;
  label: string;
}

/** A type-to-search select (LOV). Falls back to showing all options. */
export function Combobox({
  options,
  value,
  onChange,
  placeholder = "Type to search…",
}: {
  options: Option[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [queryText, setQueryText] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);

  const selectedLabel = useMemo(
    () => options.find((o) => o.value === value)?.label ?? "",
    [options, value],
  );

  const filtered = useMemo(() => {
    const q = queryText.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, queryText]);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQueryText("");
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  function pick(opt: Option) {
    onChange(opt.value);
    setOpen(false);
    setQueryText("");
  }

  return (
    <div className="combobox" ref={wrapRef}>
      <input
        className="combobox-input"
        value={open ? queryText : selectedLabel}
        placeholder={open ? placeholder : selectedLabel || placeholder}
        onFocus={() => {
          setOpen(true);
          setQueryText("");
          setActiveIndex(0);
        }}
        onChange={(e) => {
          setQueryText(e.target.value);
          setOpen(true);
          setActiveIndex(0);
        }}
        onKeyDown={(e) => {
          if (!open) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActiveIndex((i) => Math.min(i + 1, filtered.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActiveIndex((i) => Math.max(i - 1, 0));
          } else if (e.key === "Enter") {
            e.preventDefault();
            if (filtered[activeIndex]) pick(filtered[activeIndex]);
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
      />
      {open && (
        <div className="combobox-list">
          {filtered.length === 0 ? (
            <div className="combobox-empty">No matches</div>
          ) : (
            filtered.map((o, i) => (
              <div
                key={o.value}
                className={i === activeIndex ? "combobox-option active" : "combobox-option"}
                onMouseEnter={() => setActiveIndex(i)}
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(o);
                }}
              >
                {o.label}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
