import Link from "next/link";
import { Suspense } from "react";
import {
  getControlLedgers,
  getInventoryByStage,
  getJournalRegister,
  getOrganization,
  getProfitLoss,
  getTrialBalance,
} from "@/lib/erp";
import { money, qty } from "@/lib/format";
import { ControlLedgerComposition, TrialBalanceWithSubs } from "../control-ledgers";
import { DateFilter } from "./date-filter";

export const dynamic = "force-dynamic";

export default async function Reports({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const { from, to } = await searchParams;
  const range = { from, to };

  const [org, trial, pl, journal, controls, stock] = await Promise.all([
    getOrganization(),
    getTrialBalance(range),
    getProfitLoss(range),
    getJournalRegister(range),
    getControlLedgers(range),
    getInventoryByStage(),
  ]);

  const periodText =
    from || to ? `Period: ${from || "…"} to ${to || "…"}` : "All dates";

  const qsParams = new URLSearchParams();
  if (from) qsParams.set("from", from);
  if (to) qsParams.set("to", to);
  const qs = qsParams.toString() ? `?${qsParams.toString()}` : "";

  return (
    <div className="container">
      <div className="print-header">
        <h2 style={{ margin: 0 }}>{org?.name ?? "U.K Arts"}</h2>
        <div>{org?.address}</div>
        <div>Financial Reports — {periodText}</div>
        <hr />
      </div>

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
                    <td>{j.voucher_type}</td>
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
