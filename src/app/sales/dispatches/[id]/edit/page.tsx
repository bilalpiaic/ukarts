import Link from "next/link";
import { notFound } from "next/navigation";
import { getSession, isAdmin } from "@/lib/auth";
import { getDispatch, getItemsByType, getPartiesByRole } from "@/lib/erp";
import { DispatchEditForm } from "../../../dispatch-edit-form";

export const dynamic = "force-dynamic";

export default async function EditDispatchSale({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [session, doc, customers, items] = await Promise.all([
    getSession(),
    getDispatch(id),
    getPartiesByRole("CUSTOMER"),
    getItemsByType("FINISHED_GOOD"),
  ]);
  if (!doc) notFound();

  const customerOptions = customers.some((c) => c.party_code === doc.customer_code)
    ? customers
    : [{ party_code: doc.customer_code, party_name: doc.customer_name }, ...customers];
  const itemOptions = items.some((item) => item.item_code === doc.item_code)
    ? items
    : [{ item_code: doc.item_code, item_name: doc.item_name }, ...items];

  return (
    <div className="container">
      <div className="page-head">
        <h1 className="page-title">Edit system locked sale</h1>
        <Link className="btn-ghost" href={`/sales/dispatches/${doc.id}/invoice`}>
          View invoice
        </Link>
      </div>
      {isAdmin(session) ? (
        <div className="card">
          <DispatchEditForm
            dispatchId={doc.id}
            invoiceNumber={doc.invoice_number}
            doNumber={doc.do_number}
            saleOrder={doc.so_number}
            voucherNumber={doc.voucher_number}
            customers={customerOptions.map((c) => ({ value: c.party_code, label: c.party_name }))}
            items={itemOptions.map((item) => ({ value: item.item_code, label: item.item_name }))}
            initial={{
              customerCode: doc.customer_code,
              finishedItemCode: doc.item_code,
              quantity: String(Number(doc.quantity)),
              rate: String(Number(doc.rate)),
              paymentType: doc.payment_type,
              date: doc.dispatch_date,
            }}
          />
        </div>
      ) : (
        <div className="card">
          <p>Admin privileges are required to edit a sales invoice.</p>
        </div>
      )}
    </div>
  );
}
