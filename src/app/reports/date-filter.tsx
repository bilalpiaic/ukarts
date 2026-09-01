"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { PrintButton } from "../print-button";

export function DateFilter() {
  const router = useRouter();
  const sp = useSearchParams();
  const [from, setFrom] = useState(sp.get("from") ?? "");
  const [to, setTo] = useState(sp.get("to") ?? "");

  function apply() {
    const p = new URLSearchParams();
    if (from) p.set("from", from);
    if (to) p.set("to", to);
    router.push(`/reports?${p.toString()}`);
  }

  function clear() {
    setFrom("");
    setTo("");
    router.push("/reports");
  }

  return (
    <div className="toolbar no-print">
      <div className="form-row">
        <label>From</label>
        <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
      </div>
      <div className="form-row">
        <label>To</label>
        <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
      </div>
      <button type="button" onClick={apply}>
        Apply
      </button>
      <button type="button" className="btn-ghost" onClick={clear}>
        Clear
      </button>
      <PrintButton label="Print Report" />
    </div>
  );
}
