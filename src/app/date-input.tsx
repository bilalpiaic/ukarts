"use client";

import { useEffect, useState } from "react";
import { formatDate, parseDate } from "@/lib/format";

/** Text date that shows `dd-mmm-yy`, with a calendar that writes the same value. */
export function DateInput({
  value,
  onChange,
  required,
  ariaLabel,
}: {
  value: string;
  onChange: (iso: string) => void;
  required?: boolean;
  ariaLabel?: string;
}) {
  const [text, setText] = useState(() => formatDate(value));
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) setText(formatDate(value));
  }, [value, focused]);

  function commit(raw: string) {
    const iso = parseDate(raw);
    if (iso) {
      onChange(iso);
      setText(formatDate(iso));
      return;
    }
    if (!raw.trim()) {
      onChange("");
      setText("");
      return;
    }
    setText(formatDate(value));
  }

  const iso = parseDate(value) ?? "";

  return (
    <span className="date-field">
      <input
        type="text"
        className="date-text"
        inputMode="text"
        autoComplete="off"
        spellCheck={false}
        placeholder="dd-mmm-yy"
        aria-label={ariaLabel}
        required={required}
        value={text}
        onFocus={() => setFocused(true)}
        onChange={(e) => setText(e.target.value)}
        onBlur={(e) => {
          setFocused(false);
          commit(e.target.value);
        }}
      />
      <input
        type="date"
        className="date-picker"
        tabIndex={-1}
        aria-label={ariaLabel ? `${ariaLabel} calendar` : "Open calendar"}
        value={iso}
        onChange={(e) => {
          onChange(e.target.value);
          setText(formatDate(e.target.value));
        }}
      />
    </span>
  );
}
