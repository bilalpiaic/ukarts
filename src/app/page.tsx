import {
  getInventoryByStage,
  getKpis,
  getPartyLedgers,
  getProductionOrders,
  getProfitability,
  getTrialBalance,
  healthCheck,
} from "@/lib/erp";
import { money, qty } from "@/lib/format";
import { PrintButton } from "./print-button";

export const dynamic = "force-dynamic";

export default async function Overview() {
  try {
    await healthCheck();
  } catch {
    return (
      <div className="container">
        <h1 className="page-title">Overview</h1>
        <div className="card">
          <p>
            Could not reach PostgreSQL. Ensure the database is running and{" "}
            <code>DATABASE_URL</code> is set, then run <code>npm run db:setup</code>.
          </p>
        </div>
      </div>
    );
  }

  const [kpis, trial, stock, ledgers, profit, pos] = await Promise.all([
    getKpis(),
    getTrialBalance(),
    getInventoryByStage(),
    getPartyLedgers(),
    getProfitability(),
    getProductionOrders(),
  ]);

  return (
    <div className="container">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1 className="page-title">Overview</h1>
        <PrintButton label="Print Dashboard" />
      </div>

      <div className="kpis">
        <div className="kpi">
          <div className="kpi-label">Sales</div>
          <div className="kpi-value">{money(kpis.sales)}</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Expenses</div>
          <div className="kpi-value">{money(kpis.expenses)}</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Profit</div>
          <div className={`kpi-value ${kpis.profit >= 0 ? "pos" : "neg"}`}>
            {money(kpis.profit)}
          </div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Payables</div>
          <div className="kpi-value">{money(kpis.payables)}</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Receivables</div>
          <div className="kpi-value">{money(kpis.receivables)}</div>
        </div>
      </div>

      <div className="grid">
        <div className="card full">
          <h2>
            Trial Balance{" "}
            <span className="pill">
              {trial.balanced ? "Balanced ✓" : "NOT BALANCED"}
            </span>
          </h2>
          {trial.rows.length === 0 ? (
            <p className="subtitle">No posted entries yet.</p>
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
          <h2>Inventory by Stage</h2>
          {stock.length === 0 ? (
            <p className="subtitle">No stock yet.</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Location</th>
                  <th>Item</th>
                  <th>Type</th>
                  <th className="num">Stock</th>
                </tr>
              </thead>
              <tbody>
                {stock.map((r, i) => (
                  <tr key={`${r.location_code}-${r.item_code}-${i}`}>
                    <td>{r.location_name}</td>
                    <td>{r.item_code}</td>
                    <td>{r.item_type}</td>
                    <td className="num">{qty(r.stock)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="card">
          <h2>Party Ledgers (AP / AR)</h2>
          {ledgers.length === 0 ? (
            <p className="subtitle">No party balances yet.</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Party</th>
                  <th>Roles</th>
                  <th className="num">Balance</th>
                </tr>
              </thead>
              <tbody>
                {ledgers.map((r) => {
                  const bal = Number(r.balance);
                  return (
                    <tr key={r.party_code}>
                      <td>{r.party_name}</td>
                      <td>{r.roles}</td>
                      <td className="num">
                        {bal >= 0
                          ? `${money(bal)} payable`
                          : `${money(-bal)} receivable`}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        <div className="card full">
          <h2>Production Orders &amp; Profitability</h2>
          {pos.length === 0 ? (
            <p className="subtitle">No production orders yet.</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>PO</th>
                  <th>Sale Order</th>
                  <th className="num">Planned</th>
                  <th className="num">Actual</th>
                  <th>Status</th>
                  <th className="num">Revenue</th>
                  <th className="num">Cost</th>
                  <th className="num">Profit</th>
                </tr>
              </thead>
              <tbody>
                {pos.map((po) => {
                  const p = profit.find((x) => x.po_number === po.po_number);
                  return (
                    <tr key={po.po_number}>
                      <td>{po.po_number}</td>
                      <td>{po.sale_order}</td>
                      <td className="num">{qty(po.planned_quantity)}</td>
                      <td className="num">{qty(po.actual_quantity)}</td>
                      <td>
                        <span className="pill">{po.status}</span>
                      </td>
                      <td className="num">{money(p?.revenue ?? 0)}</td>
                      <td className="num">{money(p?.cost ?? 0)}</td>
                      <td className="num">{money(p?.profit ?? 0)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
