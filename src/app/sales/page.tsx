import { ActionForm } from "../action-form";
import {
  getInventoryByStage,
  getItemsByType,
  getPartiesByRole,
  getRecentJournalEntries,
  getSaleOrders,
} from "@/lib/erp";
import { money, qty } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function Sales() {
  const [customers, finishedItems, saleOrders, stage, journals] = await Promise.all([
    getPartiesByRole("CUSTOMER"),
    getItemsByType("FINISHED_GOOD"),
    getSaleOrders(),
    getInventoryByStage(),
    getRecentJournalEntries(),
  ]);

  const fgStock = stage.filter((s) => s.item_type === "FINISHED_GOOD");
  const soOptions = saleOrders.map((s) => ({ value: s.id, label: `${s.so_number} — ${s.buyer}` }));

  return (
    <div className="container">
      <h1 className="page-title">Sales &amp; Dispatch</h1>
      <div className="grid">
        <div className="card">
          <ActionForm
            action="dispatch-sale"
            title="Dispatch Sale"
            submitLabel="Post Sale"
            successMessage={(d) => `Sale posted (${money(Number(d.amount))}). Finished goods dispatched.`}
            fields={[
              { name: "saleOrderId", label: "Sale order", type: "select", options: soOptions },
              { name: "finishedItemCode", label: "Finished item", type: "select", options: finishedItems.map((f) => ({ value: f.item_code, label: f.item_name })) },
              { name: "customerCode", label: "Customer", type: "select", options: customers.map((c) => ({ value: c.party_code, label: c.party_name })) },
              { name: "quantity", label: "Quantity (pcs)", type: "number", default: "960", step: "1" },
              { name: "rate", label: "Rate / pc", type: "number", default: "1200", step: "0.01" },
              {
                name: "paymentType",
                label: "Payment",
                type: "select",
                options: [
                  { value: "CREDIT", label: "On credit (Accounts Receivable)" },
                  { value: "CASH", label: "Cash / Bank" },
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
