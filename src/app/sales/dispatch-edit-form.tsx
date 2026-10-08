"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Combobox } from "../combobox";

export function DispatchEditForm({
  dispatchId,
  invoiceNumber,
  doNumber,
  saleOrder,
  voucherNumber,
  customers,
  items,
  initial,
}: {
  dispatchId: string;
  invoiceNumber: string;
  doNumber: string;
  saleOrder: string;
  voucherNumber: string | null;
  customers: { value: string; label: string }[];
  items: { value: string; label: string }[];
  initial: {
    customerCode: string;
    finishedItemCode: string;
    quantity: string;
    rate: string;
    paymentType: string;
    date: string;
  };
}) {
  const router = useRouter();
  const [customerCode, setCustomerCode] = useState(initial.customerCode);
  const [finishedItemCode, setFinishedItemCode] = useState(initial.finishedItemCode);
  const [quantity, setQuantity] = useState(initial.quantity);
  const [rate, setRate] = useState(initial.rate);
  const [paymentType, setPaymentType] = useState(initial.paymentType);
  const [date, setDate] = useState(initial.date);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/dispatch-sale-update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: dispatchId,
          customerCode,
          finishedItemCode,
          quantity: Number(quantity),
          rate: Number(rate),
          paymentType,
          date,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not save the invoice.");
      router.push(`/sales/dispatches/${dispatchId}/invoice`);
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
        Saving keeps {doNumber} and {invoiceNumber}
        {voucherNumber ? ` and rewrites voucher ${voucherNumber}` : " and rewrites its sales voucher"}{" "}
        so the accounts match this bill. Finished-goods stock is adjusted to the new item and quantity.
        Sale order {saleOrder} stays linked.
      </p>
      <div className="form-row">
        <label>Customer</label>
        <Combobox options={customers} value={customerCode} onChange={setCustomerCode} />
      </div>
      <div className="form-row">
        <label>Finished item</label>
        <Combobox options={items} value={finishedItemCode} onChange={setFinishedItemCode} />
      </div>
      <div className="form-row">
        <label>Quantity (pcs)</label>
        <input type="number" step="1" min="0" value={quantity} onChange={(e) => setQuantity(e.target.value)} required />
      </div>
      <div className="form-row">
        <label>Rate / pc</label>
        <input type="number" step="0.01" value={rate} onChange={(e) => setRate(e.target.value)} required />
      </div>
      <div className="form-row">
        <label>Payment</label>
        <Combobox
          options={[
            { value: "CREDIT", label: "On credit (Accounts Receivable)" },
            { value: "CASH", label: "Cash" },
          ]}
          value={paymentType}
          onChange={setPaymentType}
        />
      </div>
      <div className="form-row">
        <label>Date</label>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
      </div>
      <div className="line-tools">
        <button type="submit" disabled={busy}>
          {busy ? "Saving…" : "Save and adjust voucher"}
        </button>
        <Link className="btn-ghost" href={`/sales/dispatches/${dispatchId}/invoice`}>
          Cancel
        </Link>
      </div>
      {error ? <div className="msg err">{error}</div> : null}
    </form>
  );
}
