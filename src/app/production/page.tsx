import { ActionForm } from "../action-form";
import {
  getAvailableGreyLots,
  getDesigns,
  getGreyItems,
  getItemsByType,
  getPartiesByRole,
  getProductionOrders,
  getSaleOrders,
} from "@/lib/erp";
import { money, qty } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function Production() {
  const [customers, finished, designs, greyItems, lots, saleOrders, prodOrders] =
    await Promise.all([
      getPartiesByRole("CUSTOMER"),
      getItemsByType("FINISHED_GOOD"),
      getDesigns(),
      getGreyItems(),
      getAvailableGreyLots(),
      getSaleOrders(),
      getProductionOrders(),
    ]);

  const soOptions = saleOrders.map((s) => ({ value: s.id, label: `${s.so_number} — ${s.buyer}` }));
  const poOptions = prodOrders.map((p) => ({ value: p.id, label: `${p.po_number} (${p.sale_order})` }));
  const lotOptions = lots.map((l) => ({ value: l.id, label: `${l.lot_number} — ${qty(l.available)} m avail` }));
  const designOptions = designs.map((d) => ({ value: d.design_code, label: `${d.design_name} (${d.design_code})` }));

  return (
    <div className="container">
      <h1 className="page-title">Production Planning</h1>
      <div className="grid">
        <div className="card">
          <ActionForm
            action="sale-order"
            title="Create Sale Order"
            submitLabel="Create Sale Order"
            successMessage={(d) => `Sale order ${d.soNumber} created (${money(Number(d.amount))}).`}
            fields={[
              { name: "buyerCode", label: "Customer", type: "select", options: customers.map((c) => ({ value: c.party_code, label: c.party_name })) },
              { name: "itemCode", label: "Finished item", type: "select", options: finished.map((f) => ({ value: f.item_code, label: f.item_name })) },
              { name: "designCode", label: "Design", type: "select", options: designOptions },
              { name: "quantity", label: "Quantity (pcs)", type: "number", default: "1000", step: "1" },
              { name: "rate", label: "Rate / pc", type: "number", default: "1200", step: "0.01" },
              { name: "date", label: "Date", type: "date" },
            ]}
          />
        </div>

        <div className="card">
          <ActionForm
            action="production-order"
            title="Create Production Order"
            submitLabel="Create Production Order"
            successMessage={(d) => `${d.poNumber} created; grey required ${qty(Number(d.totalGreyRequired))} m.`}
            fields={[
              { name: "saleOrderId", label: "Sale order", type: "select", options: soOptions },
              { name: "designCode", label: "Design", type: "select", options: designOptions },
              { name: "plannedQuantity", label: "Planned quantity (pcs)", type: "number", default: "1000", step: "1" },
              { name: "greyItemCode", label: "Grey item", type: "select", options: greyItems.map((g) => ({ value: g.item_code, label: g.item_name })) },
              { name: "date", label: "Date", type: "date" },
            ]}
          />
        </div>

        <div className="card">
          <ActionForm
            action="allocate-grey"
            title="Allocate Grey to Order"
            submitLabel="Allocate Grey"
            successMessage={() => "Grey allocated to the sale/production order."}
            fields={[
              { name: "greyLotId", label: "Grey lot", type: "select", options: lotOptions },
              { name: "saleOrderId", label: "Sale order", type: "select", options: soOptions },
              { name: "productionOrderId", label: "Production order", type: "select", options: poOptions },
              { name: "quantity", label: "Quantity (meters)", type: "number", default: "5000", step: "0.0001" },
              { name: "date", label: "Date", type: "date" },
            ]}
          />
        </div>

        <div className="card full">
          <h2>Sale Orders</h2>
          {saleOrders.length === 0 ? (
            <p className="subtitle">No sale orders yet.</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>SO</th>
                  <th>Date</th>
                  <th>Customer</th>
                  <th>Status</th>
                  <th className="num">Amount</th>
                </tr>
              </thead>
              <tbody>
                {saleOrders.map((s) => (
                  <tr key={s.id}>
                    <td>{s.so_number}</td>
                    <td>{s.order_date}</td>
                    <td>{s.buyer}</td>
                    <td><span className="pill">{s.status}</span></td>
                    <td className="num">{money(s.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="card full">
          <h2>Production Orders</h2>
          {prodOrders.length === 0 ? (
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
                </tr>
              </thead>
              <tbody>
                {prodOrders.map((p) => (
                  <tr key={p.id}>
                    <td>{p.po_number}</td>
                    <td>{p.sale_order}</td>
                    <td className="num">{qty(p.planned_quantity)}</td>
                    <td className="num">{qty(p.actual_quantity)}</td>
                    <td><span className="pill">{p.status}</span></td>
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
