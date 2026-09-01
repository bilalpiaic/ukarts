import { ActionForm } from "../action-form";
import {
  getAvailableGreyLots,
  getGreyItems,
  getGreyStock,
  getSuppliers,
} from "@/lib/erp";
import { money, qty } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function Purchasing() {
  const [suppliers, items, lots, stock] = await Promise.all([
    getSuppliers(),
    getGreyItems(),
    getAvailableGreyLots(),
    getGreyStock(),
  ]);

  return (
    <div className="container">
      <h1 className="page-title">Purchasing</h1>
      <div className="grid">
        <div className="card">
          <ActionForm
            action="owner-investment"
            title="Record Owner Investment"
            submitLabel="Record Owner Investment"
            successText="Posted balanced journal entry."
            fields={[
              { name: "amount", label: "Amount (Dr Cash / Cr Owner Investment)", type: "number", default: "1000000", step: "0.01" },
              { name: "date", label: "Date", type: "date" },
            ]}
          />
        </div>

        <div className="card">
          <ActionForm
            action="grey-purchase"
            title="Record Grey Purchase"
            submitLabel="Record Grey Purchase"
            successText="Grey purchase posted; grey lot created."
            fields={[
              {
                name: "supplierId",
                label: "Supplier",
                type: "select",
                options: suppliers.map((s) => ({ value: s.id, label: `${s.party_name} (${s.party_code})` })),
              },
              {
                name: "itemId",
                label: "Grey item",
                type: "select",
                options: items.map((i) => ({ value: i.id, label: `${i.item_name} (${i.item_code})` })),
              },
              { name: "quantity", label: "Quantity (meters)", type: "number", default: "6000", step: "0.0001" },
              { name: "rate", label: "Rate", type: "number", default: "100", step: "0.01" },
              { name: "date", label: "Date", type: "date" },
            ]}
          />
        </div>

        <div className="card full">
          <h2>Grey Lots (available in owner store)</h2>
          {lots.length === 0 ? (
            <p className="subtitle">No lots yet.</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Lot</th>
                  <th>Item</th>
                  <th className="num">Available</th>
                </tr>
              </thead>
              <tbody>
                {lots.map((l) => (
                  <tr key={l.id}>
                    <td>{l.lot_number}</td>
                    <td>{l.item_name}</td>
                    <td className="num">{qty(l.available)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="card full">
          <h2>Grey Stock by Location &amp; Lot</h2>
          {stock.length === 0 ? (
            <p className="subtitle">No stock yet.</p>
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
                {stock.map((r, i) => (
                  <tr key={`${r.lot_number}-${i}`}>
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
      </div>
    </div>
  );
}
