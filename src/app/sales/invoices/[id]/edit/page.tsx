import Link from "next/link";
import { notFound } from "next/navigation";
import { getSession, isAdmin } from "@/lib/auth";
import { getManualInvoice, getPartiesByRole } from "@/lib/erp";
import { ManualInvoiceEditForm } from "../../../manual-invoice-edit-form";

export const dynamic = "force-dynamic";

export default async function EditManualSalesInvoice({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [session, doc, customers] = await Promise.all([
    getSession(),
    getManualInvoice(id),
    getPartiesByRole("CUSTOMER"),
  ]);
  if (!doc) notFound();

  const customerOptions = customers.some((c) => c.party_code === doc.customer_code)
    ? customers
    : [{ party_code: doc.customer_code, party_name: doc.customer_name }, ...customers];

  return (
    <div className="container">
      <div className="page-head">
        <h1 className="page-title">Edit manual sales invoice</h1>
        <Link className="btn-ghost" href={`/sales/invoices/${doc.id}/print`}>
          View invoice
        </Link>
      </div>
      {isAdmin(session) ? (
        <div className="card">
          <ManualInvoiceEditForm
            invoiceId={doc.id}
            invoiceNumber={doc.invoice_number}
            voucherNumber={doc.voucher_number}
            customers={customerOptions.map((c) => ({ value: c.party_code, label: c.party_name }))}
            initial={{
              customerCode: doc.customer_code,
              paymentType: doc.payment_type,
              discount: String(Number(doc.discount_amount)),
              salesTax: String(Number(doc.tax_amount)),
              date: doc.invoice_date,
              narration: doc.narration ?? "",
              lines: doc.lines.map((line) => ({
                description: line.description,
                quantity: String(Number(line.quantity)),
                rate: String(Number(line.rate)),
              })),
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
