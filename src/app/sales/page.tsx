import Link from "next/link";
import { ActionForm } from "../action-form";
import {
  getInventoryByStage,
  getItemsByType,
  getPartiesByRole,
  getRecentJournalEntries,
  getSaleOrders,
  listDispatches,
} from "@/lib/erp";
import { money, qty } from "@/lib/format";
import { PrintButton } from "../print-button";
import { PrintOrgHeader } from "../print-header";
import { displayVoucherType } from "@/lib/vouchers";
import { DispatchPrintLinks } from "./print-links";

export const dynamic = "force-dynamic";

export default async function Sales() {
  const [customers, finishedItems, saleOrders, stage, journals, dispatches] = await Promise.all([
    getPartiesByRole("CUSTOMER"),
    getItemsByType("FINISHED_GOOD"),
    getSaleOrders(),
    getInventoryByStage(),
    getRecentJournalEntries(),
    listDispatches(),
  ]);

  const fgStock = stage.filter((s) => s.item_type === "FINISHED_GOOD");
  const soOptions = saleOrders.map((s) => ({ value: s.id, label: `${s.so_number} — ${s.buyer}` }));

  return (
    <div className="container">
      <PrintOrgHeader title="Sales & Dispatch" />
      <div className="page-head">
        <h1 className="page-title">Sales &amp; Dispatch</h1>
        <PrintButton />
      </div>
      <div className="grid">
        <div className="card">
          <ActionForm
            action="dispatch-sale"
            title="Dispatch Sale"
            submitLabel="Post Sale"
            successText="Sale posted. Finished goods dispatched."
            fields={[
              { name: "saleOrderId", label: "Sale order", type: "select", options: soOptions },
              { name: "finishedItemCode", label: "Finished item", type: "select", options: finishedItems.map((f) => ({ value: f.item_code, label: f.item_name })) },
              { name: "customerCode", label: "Customer", type: "select", options: customers.map((c) => ({ value: c.party_code, label: c.party_name })) },
              { name: "quantity", label: "Quantity (pcs)", type: "number", step: "1" },
              { name: "rate", label: "Rate / pc", type: "number", step: "0.01" },
              {
                name: "paymentType",
                label: "Payment",
                type: "select",
                options: [
                  { value: "CREDIT", label: "On credit (Accounts Receivable)" },
                  { value: "CASH", label: "Cash" },
                ],
              },
              { name: "date", label: "Date", type: "date" },
            ]}
          />
        </div>

        <div className="card">
          <h2>Finished Goods Stock</h2>
          {fgStock.length === 0 ? (
            <p className="subtitle">No finished goods in stock.</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Location</th>
                  <th>Item</th>
                  <th className="num">Stock</th>
                </tr>
              </thead>
              <tbody>
                {fgStock.map((r, i) => (
                  <tr key={i}>
                    <td>{r.location_name}</td>
                    <td>{r.item_name}</td>
                    <td className="num">{qty(r.stock)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="card full">
          <h2>Delivery Orders &amp; Sales Invoices</h2>
          {dispatches.length === 0 ? (
            <p className="subtitle">
              No dispatches yet. Post a sale to print a delivery order, customer invoice, and voucher.
            </p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>DO</th>
                  <th>Invoice</th>
                  <th>Date</th>
                  <th>Customer</th>
                  <th>Item</th>
                  <th className="num">Amount</th>
                  <th className="no-print">Print</th>
                </tr>
              </thead>
              <tbody>
                {dispatches.map((d) => (
                  <tr key={d.id}>
                    <td>{d.do_number}</td>
                    <td>{d.invoice_number}</td>
                    <td>{d.dispatch_date}</td>
                    <td>{d.customer_name}</td>
                    <td>{d.item_name}</td>
                    <td className="num">{money(d.amount)}</td>
                    <td className="no-print">
                      <DispatchPrintLinks dispatchId={d.id} journalEntryId={d.journal_entry_id} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="card full">
          <h2>Recent Journal Vouchers</h2>
          {journals.length === 0 ? (
            <p className="subtitle">No vouchers yet.</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Voucher</th>
                  <th>Date</th>
                  <th>Type</th>
                  <th>Description</th>
                  <th>Status</th>
                  <th className="num">Amount</th>
                </tr>
              </thead>
              <tbody>
                {journals.map((j) => (
                  <tr key={j.voucher_number}>
                    <td>
                      <Link className="src-link" href={`/vouchers/${j.id}`}>
                        {j.voucher_number}
                      </Link>
                    </td>
                    <td>{j.voucher_date}</td>
                    <td>
                      <span className={`vt-badge ${displayVoucherType(j.voucher_type).className}`}>
                        {displayVoucherType(j.voucher_type).code}
                      </span>
                    </td>
                    <td>{j.description}</td>
                    <td><span className="pill">{j.status}</span></td>
                    <td className="num">{money(j.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
