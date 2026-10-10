"use client";

import { useEffect, useState } from "react";
import { formatPrintStamp } from "@/lib/format";

/** Local date and time, refreshed when the browser opens the print dialog. */
export function PrintStamp() {
  const [label, setLabel] = useState("");

  useEffect(() => {
    function tick() {
      setLabel(formatPrintStamp(new Date()));
    }
    tick();
    window.addEventListener("beforeprint", tick);
    return () => window.removeEventListener("beforeprint", tick);
  }, []);

  return <p className="print-stamp">{label}</p>;
}
