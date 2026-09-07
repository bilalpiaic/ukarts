"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ACTION_ATTACH } from "@/lib/attachment-types";
import { AttachmentField, uploadAttachments, usePendingFiles } from "./attachments";
import { Combobox } from "./combobox";

export interface Field {
  name: string;
  label: string;
  type: "number" | "text" | "date" | "select" | "password" | "textarea";
  options?: { value: string; label: string }[];
  default?: string;
  step?: string;
  required?: boolean;
  rows?: number;
}

type Msg = { kind: "ok" | "err"; text: string } | null;

const today = () => new Date().toISOString().slice(0, 10);

function initialValue(f: Field): string {
  if (f.default !== undefined) return f.default;
  if (f.type === "date") return today();
  if (f.type === "select") return f.options?.[0]?.value ?? "";
  return "";
}

const SUMMARY_KEYS: { key: string; label: string; money?: boolean }[] = [
  { key: "soNumber", label: "SO" },
  { key: "poNumber", label: "PO" },
  { key: "amount", label: "amount", money: true },
  { key: "issuedValue", label: "issued value", money: true },
  { key: "processedValue", label: "grey consumed", money: true },
  { key: "shortageValue", label: "shortage", money: true },
  { key: "netPayable", label: "net payable", money: true },
  { key: "shortageRecovery", label: "recovery", money: true },
  { key: "totalGreyRequired", label: "grey required", money: true },
];

function summarize(data: Record<string, unknown>): string {
  const parts: string[] = [];
  for (const s of SUMMARY_KEYS) {
    const v = data[s.key];
    if (v === undefined || v === null) continue;
    const text = s.money
      ? Number(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      : String(v);
    parts.push(`${s.label} ${text}`);
  }
  return parts.length ? ` (${parts.join(", ")})` : "";
}

export function ActionForm({
  action,
  title,
  submitLabel,
  fields,
  successText,
  apiBase = "/api/action",
}: {
  action: string;
  title: string;
  submitLabel: string;
  fields: Field[];
  successText?: string;
  apiBase?: string;
}) {
  const router = useRouter();
  const attach = ACTION_ATTACH[action];
  const pending = usePendingFiles();
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(fields.map((f) => [f.name, initialValue(f)])),
  );
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);

  const disabled =
    busy ||
    fields.some(
      (f) => f.type === "select" && (f.options?.length ?? 0) === 0,
    );

  function set(name: string, value: string) {
    setValues((v) => ({ ...v, [name]: value }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const payload: Record<string, unknown> = {};
      for (const f of fields) {
        payload[f.name] =
          f.type === "number" ? Number(values[f.name]) : values[f.name];
      }
      const res = await fetch(`${apiBase}/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Request failed");
      if (attach && pending.files.length > 0) {
        const entityId =
          attach.idFrom === "payload" ? payload[attach.idKey] : (data as Record<string, unknown>)[attach.idKey];
        if (!entityId) throw new Error("Document saved, but no id was returned for attachments.");
        await uploadAttachments(attach.entityType, String(entityId), pending.files.map((f) => f.file));
        pending.clear();
      }
      setMsg({
        kind: "ok",
        text: `${successText ?? "Posted successfully."}${summarize(data)}`,
      });
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
      {fields.map((f) => (
        <div className="form-row" key={f.name}>
          <label>{f.label}</label>
          {f.type === "select" ? (
            <Combobox
              options={f.options ?? []}
              value={values[f.name]}
              onChange={(v) => set(f.name, v)}
            />
          ) : f.type === "textarea" ? (
            <textarea
              value={values[f.name]}
              onChange={(e) => set(f.name, e.target.value)}
              required={f.required ?? true}
              rows={f.rows ?? 5}
            />
          ) : (
            <input
              type={f.type}
              step={f.step}
              value={values[f.name]}
              onChange={(e) => set(f.name, e.target.value)}
              required={f.required ?? true}
              autoComplete={f.type === "password" ? "new-password" : undefined}
            />
          )}
        </div>
      ))}
      {attach && (
        <AttachmentField files={pending.files} onAdd={pending.addFiles} onRemove={pending.remove} />
      )}
      <button type="submit" disabled={disabled}>
        {busy ? "Posting…" : submitLabel}
      </button>
      {msg && <div className={`msg ${msg.kind}`}>{msg.text}</div>}
    </form>
  );
}
