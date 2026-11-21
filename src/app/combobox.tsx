"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

export interface Option {
  value: string;
  label: string;
}

/** A type-to-search select (LOV). A click opens the full list. */
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
  const [box, setBox] = useState<{ top: number; left: number; width: number; maxHeight: number } | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const selectedLabel = useMemo(
    () => options.find((o) => o.value === value)?.label ?? "",
    [options, value],
  );

  const filtered = useMemo(() => {
    const q = queryText.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.label.toLowerCase().includes(q) || o.value.toLowerCase().includes(q));
  }, [options, queryText]);

  function place() {
    const el = inputRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const spaceBelow = window.innerHeight - r.bottom - 8;
    const spaceAbove = r.top - 8;
    const openUp = spaceBelow < 160 && spaceAbove > spaceBelow;
    const maxHeight = Math.min(230, Math.max(0, openUp ? spaceAbove : spaceBelow));
    setBox({
      top: openUp ? Math.max(8, r.top - 4 - maxHeight) : r.bottom + 4,
      left: r.left,
      width: r.width,
      maxHeight,
    });
  }

  function openList() {
    setQueryText("");
    setActiveIndex(0);
    setOpen(true);
    place();
  }

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      const target = e.target as Node;
      if (wrapRef.current?.contains(target) || listRef.current?.contains(target)) return;
      setOpen(false);
      setQueryText("");
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  useEffect(() => {
    if (!open) return;
    place();
    const onMove = () => place();
    window.addEventListener("scroll", onMove, true);
    window.addEventListener("resize", onMove);
    return () => {
      window.removeEventListener("scroll", onMove, true);
      window.removeEventListener("resize", onMove);
    };
  }, [open]);

  function pick(opt: Option) {
    onChange(opt.value);
    setOpen(false);
    setQueryText("");
  }

  const list =
    open && box
      ? createPortal(
          <div
            ref={listRef}
            className="combobox-list"
            style={{ top: box.top, left: box.left, width: box.width, maxHeight: box.maxHeight }}
          >
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
          </div>,
          document.body,
        )
      : null;

  return (
    <div className="combobox" ref={wrapRef}>
      <input
        ref={inputRef}
        className="combobox-input"
        value={open ? queryText : selectedLabel}
        placeholder={open ? placeholder : selectedLabel || placeholder}
        onFocus={openList}
        onMouseDown={() => {
          if (!open) openList();
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
            setActiveIndex((i) => Math.min(i + 1, Math.max(filtered.length - 1, 0)));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActiveIndex((i) => Math.max(i - 1, 0));
          } else if (e.key === "Enter") {
            e.preventDefault();
            if (filtered[activeIndex]) pick(filtered[activeIndex]);
          } else if (e.key === "Escape") {
            setOpen(false);
            setQueryText("");
          }
        }}
      />
      <button
        type="button"
        className="combobox-toggle"
        aria-label="Show list"
        onMouseDown={(e) => {
          e.preventDefault();
          if (open) {
            setOpen(false);
            setQueryText("");
          } else {
            inputRef.current?.focus();
            openList();
          }
        }}
      >
        ▾
      </button>
      {list}
    </div>
  );
}
