"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { FRESH_START_PHRASE, type DataFootprint } from "@/lib/fresh-start";

const SCOPES = [
  {
    value: "ENTRIES_AND_MASTERS",
    label: "Everything entered so far — documents, parties, items, designs",
  },
  {
    value: "ENTRIES",
    label: "Documents only — keep parties, items, and designs",
  },
];

type Msg = { kind: "ok" | "err"; text: string } | null;

function readableCount(key: string, n: number): string {
  return `${n} ${key.replace(/_/g, " ")}`;
}

export function FreshStartCard({ footprint }: { footprint: DataFootprint }) {
  const router = useRouter();
  const [scope, setScope] = useState(SCOPES[0].value);
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);

  const rows =
    scope === "ENTRIES"
      ? footprint.entries
      : [...footprint.entries, ...footprint.masters];
  const total = rows.reduce((sum, r) => sum + r.count, 0);
  const ready = confirm.trim().toUpperCase() === FRESH_START_PHRASE;

  async function run() {
    if (
      !window.confirm(
        `Delete ${total} record(s)? Posted vouchers and ledgers cannot be recovered.`,
      )
    ) {
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/fresh-start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm, scope }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Request failed");
      const cleared = (data.cleared ?? {}) as Record<string, number>;
      const detail = Object.entries(cleared)
        .filter(([, n]) => n > 0)
        .map(([key, n]) => readableCount(key, n))
        .join(", ");
      setMsg({
        kind: "ok",
        text: detail
          ? `Fresh start complete. Deleted ${detail}.`
          : "Nothing to delete — the system was already empty.",
      });
      setConfirm("");
      router.refresh();
    } catch (err) {
      setMsg({ kind: "err", text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card danger">
      <h2>Fresh Start — Delete Testing Entries</h2>
      <p className="subtitle">
        Empties the system so the client can begin on live data. The chart of
        accounts, posting rules, units, store locations, company profile, and
        login accounts are kept. Everything removed here is permanent, so take a
        database backup first if the entries might still be needed.
      </p>

      <div className="form-row">
        <label>What to clear</label>
        <select value={scope} onChange={(e) => setScope(e.target.value)}>
          {SCOPES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </div>

      <table>
        <thead>
          <tr>
            <th>Record</th>
            <th className="num">To delete</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label}>
              <td>{r.label}</td>
              <td className="num">{r.count}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td>Total</td>
            <td className="num">{total}</td>
          </tr>
        </tfoot>
      </table>

      <div className="form-row" style={{ marginTop: 12 }}>
        <label>
          Type <code>{FRESH_START_PHRASE}</code> to confirm
        </label>
        <input
          value={confirm}
          placeholder={FRESH_START_PHRASE}
          autoComplete="off"
          onChange={(e) => setConfirm(e.target.value)}
        />
      </div>

      <button className="btn-danger" disabled={busy || !ready} onClick={run}>
        {busy ? "Deleting…" : "Delete entries and restore fresh start"}
      </button>

      {footprint.lastFreshStart && (
        <p className="subtitle" style={{ marginTop: 10 }}>
          Last fresh start: {footprint.lastFreshStart}
        </p>
      )}
      {msg && <div className={`msg ${msg.kind}`}>{msg.text}</div>}
    </div>
  );
}
