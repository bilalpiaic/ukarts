import { Suspense } from "react";
import {
  getInventoryByStage,
  getJournalRegister,
  getOrganization,
  getPartyLedgers,
  getProfitLoss,
  getTrialBalance,
} from "@/lib/erp";
import { money, qty } from "@/lib/format";
import { DateFilter } from "./date-filter";

export const dynamic = "force-dynamic";

export default async function Reports({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const { from, to } = await searchParams;
  const range = { from, to };

  const [org, trial, pl, journal, ledgers, stock] = await Promise.all([
    getOrganization(),
    getTrialBalance(range),
    getProfitLoss(range),
    getJournalRegister(range),
    getPartyLedgers(range),
    getInventoryByStage(),
  ]);

  const periodText =
    from || to ? `Period: ${from || "…"} to ${to || "…"}` : "All dates";

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
            <table>
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Account</th>
                  <th>Type</th>
                  <th className="num">Debit</th>
                  <th className="num">Credit</th>
                </tr>
              </thead>
              <tbody>
                {trial.rows.map((r) => (
                  <tr key={r.account_code}>
                    <td>{r.account_code}</td>
                    <td>{r.account_name}</td>
                    <td>{r.account_type}</td>
                    <td className="num">{money(r.debit)}</td>
                    <td className="num">{money(r.credit)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={3}>Total</td>
                  <td className="num">{money(trial.totalDebit)}</td>
                  <td className="num">{money(trial.totalCredit)}</td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>

        <div className="card">
          <h2>Party Ledgers (AP / AR)</h2>
          {ledgers.length === 0 ? (
            <p className="subtitle">No balances in this period.</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Party</th>
                  <th className="num">Balance</th>
                </tr>
              </thead>
              <tbody>
                {ledgers.map((r) => {
                  const bal = Number(r.balance);
                  return (
                    <tr key={r.party_code}>
                      <td>{r.party_name}</td>
                      <td className="num">
                        {bal >= 0 ? `${money(bal)} payable` : `${money(-bal)} receivable`}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

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
                    <td>{j.voucher_number}</td>
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
