import { ActionForm } from "../action-form";
import {
  getItemsByType,
  getPartiesByRole,
  getProductionOrders,
  getStitchingOrders,
} from "@/lib/erp";
import { qty } from "@/lib/format";
import { PrintButton } from "../print-button";

export const dynamic = "force-dynamic";

export default async function Stitching() {
  const [stitchers, processedItems, finishedItems, prodOrders, stitchOrders] =
    await Promise.all([
      getPartiesByRole("STITCHER"),
      getItemsByType("PROCESSED_CLOTH"),
      getItemsByType("FINISHED_GOOD"),
      getProductionOrders(),
      getStitchingOrders(),
    ]);

  const poOptions = prodOrders.map((p) => ({ value: p.id, label: `${p.po_number} (${p.sale_order})` }));
  const stitchOptions = stitchOrders.map((s) => ({ value: s.id, label: `${s.stitching_order_number} — ${s.stitcher}` }));
  const processedOptions = processedItems.map((i) => ({ value: i.item_code, label: i.item_name }));
  const finishedOptions = finishedItems.map((i) => ({ value: i.item_code, label: i.item_name }));

  return (
    <div className="container">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1 className="page-title">Stitching &amp; Finished Goods</h1>
        <PrintButton />
      </div>
      <div className="grid">
        <div className="card">
          <ActionForm
            action="issue-to-stitcher"
            title="Issue Processed Cloth to Stitcher"
            submitLabel="Issue to Stitcher"
            successText="Processed cloth issued to stitcher (custody move)."
            fields={[
              { name: "productionOrderId", label: "Production order", type: "select", options: poOptions },
              { name: "stitcherCode", label: "Stitcher", type: "select", options: stitchers.map((s) => ({ value: s.party_code, label: s.party_name })) },
              { name: "processedItemCode", label: "Processed item", type: "select", options: processedOptions },
              { name: "quantity", label: "Quantity (meters)", type: "number", default: "4900", step: "0.0001" },
              { name: "date", label: "Date", type: "date" },
            ]}
          />
        </div>

        <div className="card">
          <ActionForm
            action="receive-stitching"
            title="Receive Stitching (Finished Goods)"
            submitLabel="Post Stitching Receipt"
            successText="Finished goods received into inventory."
            fields={[
              { name: "stitchingOrderId", label: "Stitching order", type: "select", options: stitchOptions },
              { name: "finishedItemCode", label: "Finished item", type: "select", options: finishedOptions },
              { name: "processedItemCode", label: "Processed item consumed", type: "select", options: processedOptions },
              { name: "processedConsumed", label: "Processed consumed (m)", type: "number", default: "4900", step: "0.0001" },
              { name: "finishedQuantity", label: "Finished qty (pcs)", type: "number", default: "980", step: "1" },
              { name: "acceptedQuantity", label: "Accepted qty (pcs)", type: "number", default: "960", step: "1" },
              { name: "rejectedQuantity", label: "Rejected qty (pcs)", type: "number", default: "20", step: "1" },
              { name: "date", label: "Date", type: "date" },
            ]}
          />
        </div>

        <div className="card">
          <ActionForm
            action="stitching-bill"
            title="Stitching Bill"
            submitLabel="Post Stitching Bill"
            successText="Stitching bill posted (Dr Stitching Cost / Cr Stitcher Payable)."
            fields={[
              { name: "stitchingOrderId", label: "Stitching order", type: "select", options: stitchOptions },
              { name: "quantity", label: "Quantity (pcs)", type: "number", default: "980", step: "1" },
              { name: "rate", label: "Stitching rate / pc", type: "number", default: "150", step: "0.01" },
              { name: "deductions", label: "Deductions", type: "number", default: "0", step: "0.01" },
              { name: "date", label: "Date", type: "date" },
            ]}
          />
        </div>

        <div className="card full">
          <h2>Stitching Orders</h2>
          {stitchOrders.length === 0 ? (
            <p className="subtitle">No stitching orders yet.</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Stitcher</th>
                  <th>Production</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {stitchOrders.map((s) => (
                  <tr key={s.id}>
                    <td>{s.stitching_order_number}</td>
                    <td>{s.stitcher}</td>
                    <td>{s.production_order}</td>
                    <td><span className="pill">{s.status}</span></td>
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
