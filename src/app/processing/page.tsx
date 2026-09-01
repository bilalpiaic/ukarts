import { ActionForm } from "../action-form";
import {
  getAvailableGreyLots,
  getItemsByType,
  getPartiesByRole,
  getProcessingOrderLots,
  getProcessingOrders,
  getProductionOrders,
  getSaleOrders,
} from "@/lib/erp";
import { money, qty } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function Processing() {
  const [processors, processedItems, lots, procOrders, openLots, prodOrders, saleOrders] =
    await Promise.all([
      getPartiesByRole("PROCESSOR"),
      getItemsByType("PROCESSED_CLOTH"),
      getAvailableGreyLots(),
      getProcessingOrders(),
      getProcessingOrderLots(),
      getProductionOrders(),
      getSaleOrders(),
    ]);

  const poOptions = prodOrders.map((p) => ({ value: p.id, label: `${p.po_number} (${p.sale_order})` }));
  const soOptions = saleOrders.map((s) => ({ value: s.id, label: `${s.so_number} — ${s.buyer}` }));
  const lotOptions = lots.map((l) => ({ value: l.id, label: `${l.lot_number} — ${qty(l.available)} m avail` }));
  const procOrderOptions = procOrders.map((p) => ({ value: p.id, label: `${p.processing_order_number} — ${p.processor}` }));
  const openLotOptions = openLots.map((l) => ({ value: l.id, label: `${l.processing_order_number} — issued ${qty(l.issued)} m` }));

  return (
    <div className="container">
      <h1 className="page-title">Processing</h1>
      <div className="grid">
        <div className="card">
          <ActionForm
            action="issue-to-processor"
            title="Issue Grey to Processor"
            submitLabel="Issue to Processor"
            successMessage={(d) => `Issued (value ${money(Number(d.issuedValue))}). Custody moved to processor.`}
            fields={[
              { name: "productionOrderId", label: "Production order", type: "select", options: poOptions },
              { name: "saleOrderId", label: "Sale order", type: "select", options: soOptions },
              { name: "processorCode", label: "Processor", type: "select", options: processors.map((p) => ({ value: p.party_code, label: p.party_name })) },
              { name: "greyLotId", label: "Grey lot", type: "select", options: lotOptions },
              { name: "quantity", label: "Quantity (meters)", type: "number", default: "5000", step: "0.0001" },
              { name: "date", label: "Date", type: "date" },
            ]}
          />
        </div>

        <div className="card">
          <ActionForm
            action="receive-processing"
            title="Receive Processing + Reconcile Shortage"
            submitLabel="Post Receipt"
            successMessage={(d) => `Received. Grey consumed ${money(Number(d.processedValue))}, shortage ${money(Number(d.shortageValue))}.`}
            fields={[
              { name: "processingOrderLotId", label: "Issued lot", type: "select", options: openLotOptions },
              { name: "processedItemCode", label: "Processed item", type: "select", options: processedItems.map((i) => ({ value: i.item_code, label: i.item_name })) },
              { name: "processedQuantity", label: "Processed qty (m)", type: "number", default: "4900", step: "0.0001" },
              { name: "returnedQuantity", label: "Returned grey (m)", type: "number", default: "50", step: "0.0001" },
              { name: "shortageQuantity", label: "Shortage (m)", type: "number", default: "50", step: "0.0001" },
              {
                name: "classification",
                label: "Shortage classification",
                type: "select",
                options: [
                  { value: "NORMAL_PROCESS_LOSS", label: "Normal process loss" },
                  { value: "PROCESSOR_RECOVERABLE", label: "Processor recoverable" },
                  { value: "ABNORMAL_LOSS", label: "Abnormal loss" },
                ],
              },
              { name: "date", label: "Date", type: "date" },
            ]}
          />
        </div>

        <div className="card">
          <ActionForm
            action="processing-bill"
            title="Processing Bill"
            submitLabel="Post Processing Bill"
            successMessage={(d) => `Bill posted. Net payable ${money(Number(d.netPayable))} (recovery ${money(Number(d.shortageRecovery))}).`}
            fields={[
              { name: "processingOrderId", label: "Processing order", type: "select", options: procOrderOptions },
              { name: "quantity", label: "Processed quantity (m)", type: "number", default: "4900", step: "0.0001" },
              { name: "rate", label: "Processing rate", type: "number", default: "20", step: "0.01" },
              { name: "otherDeductions", label: "Other deductions", type: "number", default: "0", step: "0.01" },
              { name: "date", label: "Date", type: "date" },
            ]}
          />
        </div>

        <div className="card full">
          <h2>Processing Orders</h2>
          {procOrders.length === 0 ? (
            <p className="subtitle">No processing orders yet.</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Processor</th>
                  <th>Production</th>
                  <th className="num">Issued</th>
                  <th className="num">Processed</th>
                  <th className="num">Shortage</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {procOrders.map((p) => (
                  <tr key={p.id}>
                    <td>{p.processing_order_number}</td>
                    <td>{p.processor}</td>
                    <td>{p.production_order}</td>
                    <td className="num">{qty(p.issued)}</td>
                    <td className="num">{qty(p.processed)}</td>
                    <td className="num">{qty(p.shortage)}</td>
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
