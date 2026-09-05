"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Combobox } from "./combobox";

export interface HeaderField {
  name: string;
  label: string;
  type: "number" | "text" | "date" | "select";
  options?: { value: string; label: string }[];
  default?: string;
  step?: string;
  required?: boolean;
}

export interface LineColumn {
  name: string;
  label: string;
  type: "number" | "text" | "select";
  options?: { value: string; label: string }[];
  step?: string;
  default?: string;
  numeric?: boolean;
}

type Row = Record<string, string>;
type Msg = { kind: "ok" | "err"; text: string } | null;

const today = () => new Date().toISOString().slice(0, 10);

function headerInitial(f: HeaderField): string {
  if (f.default !== undefined) return f.default;
  if (f.type === "date") return today();
  if (f.type === "select") return f.options?.[0]?.value ?? "";
  return "";
}

function emptyRow(cols: LineColumn[]): Row {
  return Object.fromEntries(
    cols.map((c) => [c.name, c.default ?? (c.type === "select" ? c.options?.[0]?.value ?? "" : "")]),
  );
}

/**
 * A document-style form: fixed header fields plus a repeatable table of line
 * items. Submits `{ ...header, lines: [...] }` so several entries post at once.
 */
export function MultiLineForm({
  action,
  apiBase = "/api/action",
  title,
  submitLabel,
  successText,
  headerFields,
  lineColumns,
  initialLines = 2,
}: {
  action: string;
  apiBase?: string;
  title: string;
  submitLabel: string;
  successText?: string;
  headerFields: HeaderField[];
  lineColumns: LineColumn[];
  initialLines?: number;
}) {
  const router = useRouter();
  const [header, setHeader] = useState<Row>(() =>
    Object.fromEntries(headerFields.map((f) => [f.name, headerInitial(f)])),
  );
  const [lines, setLines] = useState<Row[]>(() =>
    Array.from({ length: Math.max(1, initialLines) }, () => emptyRow(lineColumns)),
  );
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);

  const disabled =
    busy ||
    headerFields.some((f) => f.type === "select" && (f.options?.length ?? 0) === 0);

  function setLine(i: number, name: string, value: string) {
    setLines((rows) => rows.map((r, idx) => (idx === i ? { ...r, [name]: value } : r)));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const payload: Record<string, unknown> = {};
      for (const f of headerFields) {
        payload[f.name] = f.type === "number" ? Number(header[f.name]) : header[f.name];
      }
      payload.lines = lines
        .filter((r) => lineColumns.some((c) => (r[c.name] ?? "").trim() !== ""))
        .map((r) => {
          const obj: Record<string, unknown> = {};
          for (const c of lineColumns) {
            obj[c.name] = c.numeric ? Number(r[c.name] || 0) : r[c.name];
          }
          return obj;
        });
      const res = await fetch(`${apiBase}/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Request failed");
      setMsg({ kind: "ok", text: successText ?? "Posted successfully." });
      setLines(Array.from({ length: Math.max(1, initialLines) }, () => emptyRow(lineColumns)));
      router.refresh();
    } catch (err) {
      setMsg({ kind: "err", text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <h2>{title}</h2>
      {headerFields.map((f) => (
        <div className="form-row" key={f.name}>
          <label>{f.label}</label>
          {f.type === "select" ? (
            <Combobox
              options={f.options ?? []}
              value={header[f.name]}
              onChange={(v) => setHeader((h) => ({ ...h, [f.name]: v }))}
            />
          ) : (
            <input
              type={f.type}
              step={f.step}
              value={header[f.name]}
              onChange={(e) => setHeader((h) => ({ ...h, [f.name]: e.target.value }))}
              required={f.required ?? true}
            />
          )}
        </div>
      ))}

      <table className="lines-table">
        <thead>
          <tr>
            <th style={{ width: 28 }}>#</th>
            {lineColumns.map((c) => (
              <th key={c.name} className={c.numeric ? "num" : ""}>
                {c.label}
              </th>
            ))}
            <th style={{ width: 34 }}></th>
          </tr>
        </thead>
        <tbody>
          {lines.map((row, i) => (
            <tr key={i}>
              <td>{i + 1}</td>
              {lineColumns.map((c) => (
                <td key={c.name} className={c.numeric ? "num" : ""}>
                  {c.type === "select" ? (
                    <Combobox
                      options={c.options ?? []}
                      value={row[c.name]}
                      onChange={(v) => setLine(i, c.name, v)}
                    />
                  ) : (
                    <input
                      type={c.type}
                      step={c.step}
                      value={row[c.name]}
                      onChange={(e) => setLine(i, c.name, e.target.value)}
                    />
                  )}
                </td>
              ))}
              <td>
                <button
                  type="button"
                  className="icon-btn"
                  onClick={() => setLines((r) => (r.length > 1 ? r.filter((_, idx) => idx !== i) : r))}
                  aria-label="Remove line"
                >
                  ×
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="line-tools">
        <button type="button" className="btn-ghost" onClick={() => setLines((r) => [...r, emptyRow(lineColumns)])}>
          + Add line
        </button>
        <button type="submit" disabled={disabled}>
          {busy ? "Posting…" : submitLabel}
        </button>
      </div>
      {msg && <div className={`msg ${msg.kind}`}>{msg.text}</div>}
    </form>
  );
}
