import Link from "next/link";
import { Suspense } from "react";
import {
  getControlLedgers,
  getInventoryByStage,
  getJournalRegister,
  getOrganization,
  getProfitLoss,
  getTrialBalance,
  listSalesInvoiceReport,
} from "@/lib/erp";
import { money, qty } from "@/lib/format";
import { salesPaymentLabel } from "@/lib/sales-invoice";
import { ControlLedgerComposition, TrialBalanceWithSubs } from "../control-ledgers";
import { PrintHeader } from "../print-header";
import { DateFilter } from "./date-filter";
import { displayVoucherType } from "@/lib/vouchers";

export const dynamic = "force-dynamic";

export default async function Reports({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const { from, to } = await searchParams;
  const range = { from, to };

  const [org, trial, pl, journal, controls, stock, invoices] = await Promise.all([
    getOrganization(),
    getTrialBalance(range),
    getProfitLoss(range),
    getJournalRegister(range),
    getControlLedgers(range),
    getInventoryByStage(),
    listSalesInvoiceReport(range),
  ]);

  const periodText =
    from || to ? `Period: ${from || "…"} to ${to || "…"}` : "All dates";

  const qsParams = new URLSearchParams();
  if (from) qsParams.set("from", from);
  if (to) qsParams.set("to", to);
  const qs = qsParams.toString() ? `?${qsParams.toString()}` : "";

  return (
    <div className="container">
      <PrintHeader org={org} title={`Financial Reports — ${periodText}`} />

      <h1 className="page-title">Reports Dashboard</h1>
      <Suspense fallback={<div className="toolbar" />}>
        <DateFilter />
      </Suspense>

      <div className="kpis">
        <div className="kpi">
          <div className="kpi-label">Income</div>
          <div className="kpi-value">{money(pl.income)}</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Expenses</div>
          <div className="kpi-value">{money(pl.expense)}</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Net Profit</div>
          <div className={`kpi-value ${pl.net >= 0 ? "pos" : "neg"}`}>
            {money(pl.net)}
          </div>
        </div>
      </div>

      <div className="grid">
        <div className="card full">
          <h2>
            Trial Balance{" "}
            <span className="pill">{trial.balanced ? "Balanced ✓" : "NOT BALANCED"}</span>
          </h2>
          {trial.rows.length === 0 ? (
            <p className="subtitle">No posted entries in this period.</p>
          ) : (
            <TrialBalanceWithSubs
              rows={trial.rows}
              totalDebit={trial.totalDebit}
              totalCredit={trial.totalCredit}
              qs={qs}
              groups={controls}
            />
          )}
        </div>

        <ControlLedgerComposition groups={controls} qs={qs} />

        <div className="card">
          <h2>Inventory by Stage</h2>
          {stock.length === 0 ? (
            <p className="subtitle">No stock.</p>
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
                {stock.map((r, i) => (
                  <tr key={i}>
                    <td>{r.location_name}</td>
                    <td>{r.item_code}</td>
                    <td className="num">{qty(r.stock)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="card full" id="sales-invoices">
          <h2>Sales Invoices</h2>
          <p className="subtitle">
            Invoice numbers open the bill. System locked sales and manual sales invoices are listed together.
          </p>
          {invoices.length === 0 ? (
            <p className="subtitle">No sales invoices in this period.</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Invoice</th>
                  <th>Type</th>
                  <th>Date</th>
                  <th>Customer</th>
                  <th>DO</th>
                  <th>Settlement</th>
                  <th className="num">Net</th>
                  <th>Voucher</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv) => {
                  const href =
                    inv.kind === "PROCESS"
                      ? `/sales/dispatches/${inv.id}/invoice`
                      : `/sales/invoices/${inv.id}/print`;
                  return (
                    <tr key={`${inv.kind}-${inv.id}`}>
                      <td>
                        <Link className="src-link" href={href}>
                          {inv.invoice_number}
                        </Link>
                      </td>
                      <td>
                        <span className="pill">{inv.kind === "PROCESS" ? "System locked" : "Manual"}</span>
                      </td>
                      <td>{inv.invoice_date}</td>
                      <td>{inv.customer_name}</td>
                      <td>
                        {inv.do_number ? (
                          <Link className="src-link" href={`/sales/dispatches/${inv.id}/do`}>
                            {inv.do_number}
                          </Link>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td>{salesPaymentLabel(inv.payment_type)}</td>
                      <td className="num">{money(inv.net_amount)}</td>
                      <td>
                        {inv.journal_entry_id ? (
                          <Link className="src-link" href={`/vouchers/${inv.journal_entry_id}`}>
                            {inv.voucher_number}
                          </Link>
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        <div className="card full">
          <h2>Journal Register</h2>
          {journal.length === 0 ? (
            <p className="subtitle">No vouchers in this period.</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Voucher</th>
                  <th>Date</th>
                  <th>Type</th>
                  <th>Description</th>
                  <th className="num">Amount</th>
                </tr>
              </thead>
              <tbody>
                {journal.map((j) => (
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
