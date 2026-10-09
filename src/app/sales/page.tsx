import Link from "next/link";
import { ActionForm } from "../action-form";
import { MultiLineForm } from "../multi-line-form";
import { getSession, isAdmin } from "@/lib/auth";
import {
  getInventoryByStage,
  getItemsByType,
  getPartiesByRole,
  getRecentJournalEntries,
  getSaleOrders,
  listDispatches,
  listManualInvoices,
} from "@/lib/erp";
import { money, qty } from "@/lib/format";
import { salesPaymentLabel } from "@/lib/sales-invoice";
import { PrintButton } from "../print-button";
import { PrintOrgHeader } from "../print-header";
import { displayVoucherType } from "@/lib/vouchers";
import { InvoiceAdminActions } from "./invoice-admin-actions";
import { DispatchPrintLinks } from "./print-links";
import { ManualInvoicePrintLinks } from "./manual-print-links";

export const dynamic = "force-dynamic";

export default async function Sales() {
  const [session, customers, finishedItems, saleOrders, stage, journals, dispatches, manualInvoices] =
    await Promise.all([
      getSession(),
      getPartiesByRole("CUSTOMER"),
      getItemsByType("FINISHED_GOOD"),
      getSaleOrders(),
      getInventoryByStage(),
      getRecentJournalEntries(),
      listDispatches(),
      listManualInvoices(),
    ]);
  const admin = isAdmin(session);

  const fgStock = stage.filter((s) => s.item_type === "FINISHED_GOOD");
  const soOptions = saleOrders.map((s) => ({ value: s.id, label: `${s.so_number} — ${s.buyer}` }));

  return (
    <div className="container">
      <PrintOrgHeader title="Sales & Dispatch" />
      <div className="page-head">
        <h1 className="page-title">Sales &amp; Dispatch</h1>
        <div className="row-actions">
          <Link className="btn-ghost" href="/reports#sales-invoices">
            Invoice report
          </Link>
          <PrintButton />
        </div>
      </div>
      <div className="grid">
        <div className="card">
          <ActionForm
            action="dispatch-sale"
            title="Dispatch Sale"
            submitLabel="Post Sale"
            hint="Process sale. Requires a sale order and finished-goods stock, then prints the delivery order, customer invoice, and voucher together."
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
          <MultiLineForm
            action="manual-sales-invoice"
            title="Manual Sales Invoice"
            submitLabel="Post Invoice"
            successText="Manual sales invoice posted to the accounts."
            hint="Not locked to a sale order or stock. Debits Cash in Hand, Bank, or Accounts Receivable for the net bill. Debits Discount Allowed when a discount is given. Credits Sales Income for the goods and Sales Tax Payable when tax is charged."
            headerFields={[
              {
                name: "customerCode",
                label: "Customer",
                type: "select",
                options: customers.map((c) => ({ value: c.party_code, label: c.party_name })),
              },
              {
                name: "paymentType",
                label: "Settlement account",
                type: "select",
                options: [
                  { value: "CREDIT", label: "Credit — Accounts Receivable" },
                  { value: "CASH", label: "Cash — Cash in Hand" },
                  { value: "BANK", label: "Bank" },
                ],
              },
              { name: "discount", label: "Discount allowed", type: "number", step: "0.01", default: "0", required: false },
              { name: "salesTax", label: "Sales tax payable", type: "number", step: "0.01", default: "0", required: false },
              { name: "date", label: "Date", type: "date" },
              { name: "narration", label: "Narration", type: "text", required: false },
            ]}
            lineColumns={[
              { name: "description", label: "Description", type: "text" },
              { name: "quantity", label: "Qty", type: "number", step: "0.0001", numeric: true },
              { name: "rate", label: "Rate", type: "number", step: "0.01", numeric: true },
            ]}
          />
        </div>

        <div className="card full">
          <h2>Manual Sales Invoices</h2>
          {manualInvoices.length === 0 ? (
            <p className="subtitle">No manual bills yet.</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Invoice</th>
                  <th>Date</th>
                  <th>Customer</th>
                  <th>Settlement</th>
                  <th className="num">Net</th>
                  <th className="no-print">Print</th>
                  {admin ? <th className="no-print">Actions</th> : null}
                </tr>
              </thead>
              <tbody>
                {manualInvoices.map((inv) => (
                  <tr key={inv.id}>
                    <td>
                      <Link className="src-link" href={`/sales/invoices/${inv.id}/print`}>
                        {inv.invoice_number}
                      </Link>
                    </td>
                    <td>{inv.invoice_date}</td>
                    <td>{inv.customer_name}</td>
                    <td>{salesPaymentLabel(inv.payment_type)}</td>
                    <td className="num">{money(inv.net_amount)}</td>
                    <td className="no-print">
                      <ManualInvoicePrintLinks
                        invoiceId={inv.id}
                        journalEntryId={inv.journal_entry_id}
                      />
                    </td>
                    {admin ? (
                      <td className="no-print">
                        <InvoiceAdminActions
                          editHref={`/sales/invoices/${inv.id}/edit`}
                          endpoint="/api/admin/manual-sales-delete"
                          invoiceId={inv.id}
                          confirmText="Delete this manual sales invoice and its voucher? This cannot be undone."
                        />
                      </td>
                    ) : null}
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
                  {admin ? <th className="no-print">Actions</th> : null}
                </tr>
              </thead>
              <tbody>
                {dispatches.map((d) => (
                  <tr key={d.id}>
                    <td>
                      <Link className="src-link" href={`/sales/dispatches/${d.id}/do`}>
                        {d.do_number}
                      </Link>
                    </td>
                    <td>
                      <Link className="src-link" href={`/sales/dispatches/${d.id}/invoice`}>
                        {d.invoice_number}
                      </Link>
                    </td>
                    <td>{d.dispatch_date}</td>
                    <td>{d.customer_name}</td>
                    <td>{d.item_name}</td>
                    <td className="num">{money(d.amount)}</td>
                    <td className="no-print">
                      <DispatchPrintLinks dispatchId={d.id} journalEntryId={d.journal_entry_id} />
                    </td>
                    {admin ? (
                      <td className="no-print">
                        <InvoiceAdminActions
                          editHref={`/sales/dispatches/${d.id}/edit`}
                          endpoint="/api/admin/dispatch-sale-delete"
                          invoiceId={d.id}
                          confirmText="Delete this sales invoice, its delivery order, and its voucher? Finished goods return to stock. This cannot be undone."
                        />
                      </td>
                    ) : null}
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
