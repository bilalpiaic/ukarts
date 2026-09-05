"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Combobox, type Option } from "../combobox";

export interface VoucherLine {
  accountCode: string;
  partyCode: string;
  debit: string;
  credit: string;
  description: string;
}

const today = () => new Date().toISOString().slice(0, 10);

function blankLine(): VoucherLine {
  return { accountCode: "", partyCode: "", debit: "", credit: "", description: "" };
}

const money = (n: number) =>
  n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Multi-line manual journal voucher entry (create or edit a draft). */
export function VoucherForm({
  accounts,
  parties,
  mode = "create",
  existing,
}: {
  accounts: Option[];
  parties: Option[];
  mode?: "create" | "edit";
  existing?: {
    id: string;
    voucherDate: string;
    description: string;
    lines: VoucherLine[];
  };
}) {
  const router = useRouter();
  const [voucherDate, setVoucherDate] = useState(existing?.voucherDate ?? today());
  const [description, setDescription] = useState(existing?.description ?? "");
  const [lines, setLines] = useState<VoucherLine[]>(
    existing?.lines?.length ? existing.lines : [blankLine(), blankLine()],
  );
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const totals = useMemo(() => {
    const debit = lines.reduce((s, l) => s + (Number(l.debit) || 0), 0);
    const credit = lines.reduce((s, l) => s + (Number(l.credit) || 0), 0);
    return { debit, credit, balanced: Math.abs(debit - credit) < 0.005 && debit > 0 };
  }, [lines]);

  function setLine(i: number, key: keyof VoucherLine, value: string) {
    setLines((rows) => rows.map((r, idx) => (idx === i ? { ...r, [key]: value } : r)));
  }

  async function submit(post: boolean) {
    setBusy(true);
    setMsg(null);
    try {
      const payload = {
        id: existing?.id,
        voucherDate,
        description,
        post,
        lines: lines
          .filter((l) => l.accountCode && (Number(l.debit) > 0 || Number(l.credit) > 0))
          .map((l) => ({
            accountCode: l.accountCode,
            partyCode: l.partyCode || null,
            debit: Number(l.debit) || 0,
            credit: Number(l.credit) || 0,
            description: l.description || null,
          })),
      };
      const action = mode === "edit" ? "journal-update" : "journal-create";
      const res = await fetch(`/api/action/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Request failed");
      if (mode === "edit") {
        router.push(`/vouchers/${existing?.id}`);
        router.refresh();
        return;
      }
      if (data.journalEntryId) {
        router.push(`/vouchers/${data.journalEntryId}`);
        router.refresh();
        return;
      }
      setMsg({ kind: "ok", text: "Saved." });
      setLines([blankLine(), blankLine()]);
      setDescription("");
      router.refresh();
    } catch (err) {
      setMsg({ kind: "err", text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={(e) => e.preventDefault()}>
      <h2>{mode === "edit" ? "Edit Journal Voucher" : "New Journal Voucher"}</h2>
      <div className="header-fields">
        <div className="form-row">
          <label>Voucher date</label>
          <input type="date" value={voucherDate} onChange={(e) => setVoucherDate(e.target.value)} />
        </div>
        <div className="form-row">
          <label>Narration / description</label>
          <input
            type="text"
            value={description}
            placeholder="e.g. Rent paid for July"
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
      </div>

      <table className="lines-table">
        <thead>
          <tr>
            <th style={{ width: 26 }}>#</th>
            <th>Account</th>
            <th>Party (optional)</th>
            <th className="num" style={{ width: 120 }}>Debit</th>
            <th className="num" style={{ width: 120 }}>Credit</th>
            <th style={{ width: 34 }}></th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l, i) => (
            <tr key={i}>
              <td data-label="Line">{i + 1}</td>
              <td data-label="Account">
                <Combobox options={accounts} value={l.accountCode} onChange={(v) => setLine(i, "accountCode", v)} />
              </td>
              <td data-label="Party">
                <Combobox options={parties} value={l.partyCode} onChange={(v) => setLine(i, "partyCode", v)} placeholder="—" />
              </td>
              <td className="num" data-label="Debit">
                <input
                  type="number"
                  step="0.01"
                  value={l.debit}
                  onChange={(e) => setLine(i, "debit", e.target.value)}
                />
              </td>
              <td className="num" data-label="Credit">
                <input
                  type="number"
                  step="0.01"
                  value={l.credit}
                  onChange={(e) => setLine(i, "credit", e.target.value)}
                />
              </td>
              <td data-label="">
                <button
                  type="button"
                  className="icon-btn"
                  onClick={() => setLines((r) => (r.length > 2 ? r.filter((_, idx) => idx !== i) : r))}
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
        <button type="button" className="btn-ghost" onClick={() => setLines((r) => [...r, blankLine()])}>
          + Add line
        </button>
      </div>

      <div className="balance-strip">
        <span>Total Debit: <strong>{money(totals.debit)}</strong></span>
        <span>Total Credit: <strong>{money(totals.credit)}</strong></span>
        <span className={totals.balanced ? "bal-ok" : "bal-bad"}>
          {totals.balanced ? "Balanced ✓" : `Out of balance by ${money(Math.abs(totals.debit - totals.credit))}`}
        </span>
      </div>

      <div className="line-tools">
        <button type="button" className="btn-ghost" disabled={busy} onClick={() => submit(false)}>
          {busy ? "Saving…" : "Save as Draft"}
        </button>
        <button type="button" disabled={busy || !totals.balanced} onClick={() => submit(true)}>
          {busy ? "Posting…" : "Post Voucher"}
        </button>
      </div>
      {msg && <div className={`msg ${msg.kind}`}>{msg.text}</div>}
    </form>
  );
}
