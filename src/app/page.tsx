import {
  getGreyItems,
  getGreyStock,
  getRecentJournalEntries,
  getSuppliers,
  getTrialBalance,
  healthCheck,
} from "@/lib/erp";
import { GreyPurchaseForm, OwnerInvestmentForm } from "./forms";

export const dynamic = "force-dynamic";

const money = (v: number | string) =>
  Number(v).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const qty = (v: number | string) =>
  Number(v).toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 4,
  });

export default async function Home() {
  let dbOk = true;
  try {
    await healthCheck();
  } catch {
    dbOk = false;
  }

  if (!dbOk) {
    return (
      <div className="container">
        <div className="header">
          <div>
            <h1>U.K Arts ERP</h1>
            <div className="subtitle">Textile ERP Accounting System</div>
          </div>
          <span className="badge">DB: unavailable</span>
        </div>
        <div className="card">
          <p>
            Could not reach PostgreSQL. Ensure the database is running and{" "}
            <code>DATABASE_URL</code> is set, then run <code>npm run db:setup</code>.
          </p>
        </div>
      </div>
    );
  }

  const [trial, stock, suppliers, items, journals] = await Promise.all([
    getTrialBalance(),
    getGreyStock(),
    getSuppliers(),
    getGreyItems(),
    getRecentJournalEntries(),
  ]);

  const supplierOptions = suppliers.map((s) => ({
    id: s.id,
    label: `${s.party_name} (${s.party_code})`,
  }));
  const itemOptions = items.map((i) => ({
    id: i.id,
    label: `${i.item_name} (${i.item_code})`,
  }));

  return (
    <div className="container">
      <div className="header">
        <div>
          <h1>U.K Arts ERP</h1>
          <div className="subtitle">
            Inventory ledger · Production ledger · Double-entry general ledger
          </div>
        </div>
        <span className="badge ok">● PostgreSQL connected</span>
      </div>

      <div className="grid">
        <div className="card">
          <h2>Record Owner Investment</h2>
          <OwnerInvestmentForm />
        </div>

        <div className="card">
          <h2>Record Grey Purchase</h2>
          <GreyPurchaseForm suppliers={supplierOptions} items={itemOptions} />
        </div>

        <div className="card full">
          <h2>
            Trial Balance{" "}
            <span className="pill">
              {trial.balanced ? "Balanced ✓" : "NOT BALANCED"}
            </span>
          </h2>
          {trial.rows.length === 0 ? (
            <p className="subtitle">
              No posted entries yet. Record an owner investment or grey purchase
              above.
            </p>
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

        <div className="card full">
          <h2>Grey Stock by Location &amp; Lot (from inventory ledger)</h2>
          {stock.length === 0 ? (
            <p className="subtitle">No stock yet. Record a grey purchase above.</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Location</th>
                  <th>Item</th>
                  <th>Lot</th>
                  <th className="num">Stock</th>
                  <th className="num">Value</th>
                </tr>
              </thead>
              <tbody>
                {stock.map((r, idx) => (
                  <tr key={`${r.lot_number}-${idx}`}>
                    <td>{r.location_name}</td>
                    <td>{r.item_name}</td>
                    <td>{r.lot_number}</td>
                    <td className="num">{qty(r.stock)}</td>
                    <td className="num">{money(r.value)}</td>
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
                    <td>{j.voucher_number}</td>
                    <td>{j.voucher_date}</td>
                    <td>{j.voucher_type}</td>
                    <td>{j.description}</td>
                    <td>
                      <span className="pill">{j.status}</span>
                    </td>
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
