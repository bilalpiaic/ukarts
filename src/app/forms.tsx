"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

const today = () => new Date().toISOString().slice(0, 10);

type Msg = { kind: "ok" | "err"; text: string } | null;

export function OwnerInvestmentForm() {
  const router = useRouter();
  const [amount, setAmount] = useState("500000");
  const [date, setDate] = useState(today());
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/owner-investment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: Number(amount), date }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Request failed");
      setMsg({ kind: "ok", text: `Posted balanced journal entry.` });
      router.refresh();
    } catch (err) {
      setMsg({ kind: "err", text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <div className="form-row">
        <label>Amount (Dr Cash / Cr Owner Investment)</label>
        <input
          type="number"
          min="1"
          step="0.01"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          required
        />
      </div>
      <div className="form-row">
        <label>Date</label>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          required
        />
      </div>
      <button type="submit" disabled={busy}>
        {busy ? "Posting…" : "Record Owner Investment"}
      </button>
      {msg && <div className={`msg ${msg.kind}`}>{msg.text}</div>}
    </form>
  );
}

interface Option {
  id: string;
  label: string;
}

export function GreyPurchaseForm({
  suppliers,
  items,
}: {
  suppliers: Option[];
  items: Option[];
}) {
  const router = useRouter();
  const [supplierId, setSupplierId] = useState(suppliers[0]?.id ?? "");
  const [itemId, setItemId] = useState(items[0]?.id ?? "");
  const [quantity, setQuantity] = useState("1000");
  const [rate, setRate] = useState("120");
  const [date, setDate] = useState(today());
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/grey-purchase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          supplierId,
          itemId,
          quantity: Number(quantity),
          rate: Number(rate),
          date,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Request failed");
      setMsg({
        kind: "ok",
        text: `Purchase posted: lot created, stock in, journal amount ${data.amount}.`,
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
      <div className="form-row">
        <label>Supplier</label>
        <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
          {suppliers.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
      </div>
      <div className="form-row">
        <label>Grey item</label>
        <select value={itemId} onChange={(e) => setItemId(e.target.value)}>
          {items.map((i) => (
            <option key={i.id} value={i.id}>
              {i.label}
            </option>
          ))}
        </select>
      </div>
      <div className="form-row">
        <label>Quantity (meters)</label>
        <input
          type="number"
          min="0.0001"
          step="0.0001"
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
          required
        />
      </div>
      <div className="form-row">
        <label>Rate</label>
        <input
          type="number"
          min="0.01"
          step="0.01"
          value={rate}
          onChange={(e) => setRate(e.target.value)}
          required
        />
      </div>
      <div className="form-row">
        <label>Date</label>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          required
        />
      </div>
      <button type="submit" disabled={busy || !supplierId || !itemId}>
        {busy ? "Posting…" : "Record Grey Purchase"}
      </button>
      {msg && <div className={`msg ${msg.kind}`}>{msg.text}</div>}
    </form>
  );
}
