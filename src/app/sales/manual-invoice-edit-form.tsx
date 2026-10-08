"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Combobox } from "../combobox";

type Line = { description: string; quantity: string; rate: string };

export function ManualInvoiceEditForm({
  invoiceId,
  invoiceNumber,
  voucherNumber,
  customers,
  initial,
}: {
  invoiceId: string;
  invoiceNumber: string;
  voucherNumber: string | null;
  customers: { value: string; label: string }[];
  initial: {
    customerCode: string;
    paymentType: string;
    discount: string;
    salesTax: string;
    date: string;
    narration: string;
    lines: Line[];
  };
}) {
  const router = useRouter();
  const [customerCode, setCustomerCode] = useState(initial.customerCode);
  const [paymentType, setPaymentType] = useState(initial.paymentType);
  const [discount, setDiscount] = useState(initial.discount);
  const [salesTax, setSalesTax] = useState(initial.salesTax);
  const [date, setDate] = useState(initial.date);
  const [narration, setNarration] = useState(initial.narration);
  const [lines, setLines] = useState<Line[]>(initial.lines.length ? initial.lines : [{ description: "", quantity: "", rate: "" }]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function setLine(index: number, field: keyof Line, value: string) {
    setLines((rows) => rows.map((row, i) => (i === index ? { ...row, [field]: value } : row)));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/manual-sales-update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: invoiceId,
          customerCode,
          paymentType,
          discount: Number(discount || 0),
          salesTax: Number(salesTax || 0),
          date,
          narration,
          lines: lines
            .filter((l) => l.description.trim() || l.quantity || l.rate)
            .map((l) => ({
              description: l.description,
              quantity: Number(l.quantity || 0),
              rate: Number(l.rate || 0),
            })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not save the invoice.");
      router.push(`/sales/invoices/${invoiceId}/print`);
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <h2>Edit {invoiceNumber}</h2>
      <p className="subtitle">
        Saving keeps {invoiceNumber}
        {voucherNumber ? ` and rewrites voucher ${voucherNumber}` : " and rewrites its voucher"} so Cash,
        Bank, Accounts Receivable, Discount Allowed, Sales Income, and Sales Tax Payable match this bill.
        Stock is not moved.
      </p>
      <div className="form-row">
        <label>Customer</label>
        <Combobox options={customers} value={customerCode} onChange={setCustomerCode} />
      </div>
      <div className="form-row">
        <label>Settlement account</label>
        <Combobox
          options={[
            { value: "CREDIT", label: "Credit — Accounts Receivable" },
            { value: "CASH", label: "Cash — Cash in Hand" },
            { value: "BANK", label: "Bank" },
          ]}
          value={paymentType}
          onChange={setPaymentType}
        />
      </div>
      <div className="form-row">
        <label>Discount allowed</label>
        <input type="number" step="0.01" value={discount} onChange={(e) => setDiscount(e.target.value)} />
      </div>
      <div className="form-row">
        <label>Sales tax payable</label>
        <input type="number" step="0.01" value={salesTax} onChange={(e) => setSalesTax(e.target.value)} />
      </div>
      <div className="form-row">
        <label>Date</label>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
      </div>
      <div className="form-row">
        <label>Narration</label>
        <input type="text" value={narration} onChange={(e) => setNarration(e.target.value)} />
      </div>

      <table className="lines-table">
        <thead>
          <tr>
            <th style={{ width: 28 }}>#</th>
            <th>Description</th>
            <th className="num">Qty</th>
            <th className="num">Rate</th>
            <th style={{ width: 34 }}></th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line, i) => (
            <tr key={i}>
              <td>{i + 1}</td>
              <td>
                <input value={line.description} onChange={(e) => setLine(i, "description", e.target.value)} />
              </td>
              <td className="num">
                <input type="number" step="0.0001" value={line.quantity} onChange={(e) => setLine(i, "quantity", e.target.value)} />
              </td>
              <td className="num">
                <input type="number" step="0.01" value={line.rate} onChange={(e) => setLine(i, "rate", e.target.value)} />
              </td>
              <td>
                <button
                  type="button"
                  className="icon-btn"
                  aria-label="Remove line"
                  onClick={() => setLines((rows) => (rows.length > 1 ? rows.filter((_, idx) => idx !== i) : rows))}
                >
                  ×
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="line-tools">
        <button
          type="button"
          className="btn-ghost"
          onClick={() => setLines((rows) => [...rows, { description: "", quantity: "", rate: "" }])}
        >
          + Add line
        </button>
        <button type="submit" disabled={busy}>
          {busy ? "Saving…" : "Save and adjust voucher"}
        </button>
        <Link className="btn-ghost" href={`/sales/invoices/${invoiceId}/print`}>
          Cancel
        </Link>
      </div>
      {error ? <div className="msg err">{error}</div> : null}
    </form>
  );
}
