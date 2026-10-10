import type { CustomerBalance, DispatchDocument, Organization } from "@/lib/erp";
import { formatDocDate, money, qty } from "@/lib/format";
import { PrintButton } from "../print-button";
import { CustomerClosingBalance } from "./customer-balance";
import { InvoiceAdminActions } from "./invoice-admin-actions";
import { DispatchPrintLinks } from "./print-links";

export function CommercialSheet({
  org,
  doc,
  kind,
  admin = false,
}: {
  org: Organization | null;
  doc: DispatchDocument & CustomerBalance;
  kind: "do" | "invoice";
  admin?: boolean;
}) {
  const isInvoice = kind === "invoice";
  const title = isInvoice ? "CUSTOMER SALES INVOICE" : "DELIVERY ORDER";
  const number = isInvoice ? doc.invoice_number : doc.do_number;
  const currency = org?.currency ?? "PKR";
  const contact = [org?.phone, org?.email].filter(Boolean).join(" · ");

  return (
    <div className="print-page">
      <div className="print-toolbar no-print">
        <PrintButton label={isInvoice ? "Print Sales Invoice" : "Print Delivery Order"} />
        <DispatchPrintLinks dispatchId={doc.id} journalEntryId={doc.journal_entry_id} />
        {admin ? (
          <InvoiceAdminActions
            editHref={`/sales/dispatches/${doc.id}/edit`}
            endpoint="/api/admin/dispatch-sale-delete"
            invoiceId={doc.id}
            confirmText="Delete this sales invoice, its delivery order, and its voucher? Finished goods return to stock. This cannot be undone."
            redirectTo="/sales"
          />
        ) : null}
      </div>
      <article className="print-sheet">
        <header className="print-sheet-org">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="" width={64} height={64} />
          <div>
            <h1>{org?.name ?? "U.K Arts"}</h1>
            {org?.address ? <div>{org.address}</div> : null}
            {contact ? <div>{contact}</div> : null}
            {org?.tax_id ? <div>NTN / Tax ID: {org.tax_id}</div> : null}
          </div>
        </header>
        <div className="print-sheet-banner">{title}</div>
        <div className="print-sheet-meta">
          <div>
            <div className="k">{isInvoice ? "Invoice No." : "DO No."}</div>
            <div className="v">{number}</div>
          </div>
          <div>
            <div className="k">Date</div>
            <div className="v">{formatDocDate(doc.dispatch_date)}</div>
          </div>
          <div>
            <div className="k">Sale Order</div>
            <div className="v">{doc.so_number}</div>
          </div>
          <div>
            <div className="k">{isInvoice ? "Also DO" : "Also Invoice"}</div>
            <div className="v">{isInvoice ? doc.do_number : doc.invoice_number}</div>
          </div>
        </div>
        <div className="print-sheet-party">
          <div className="k">Customer</div>
          <div className="v">{doc.customer_name}</div>
          {doc.customer_address ? <div>{doc.customer_address}</div> : null}
          {doc.customer_phone ? <div>{doc.customer_phone}</div> : null}
          {isInvoice ? (
            <div className="print-pay">
              Payment: {doc.payment_type === "CASH" ? "Cash" : "Credit — Accounts Receivable"}
            </div>
          ) : (
            <div className="print-pay">Goods dispatched from Finished Goods store</div>
          )}
        </div>
        <table className="print-sheet-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Item</th>
              <th>Description</th>
              <th className="num">Qty</th>
              <th>Unit</th>
              {isInvoice ? <th className="num">Rate</th> : null}
              {isInvoice ? <th className="num">Amount</th> : null}
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>1</td>
              <td>{doc.item_code}</td>
              <td>{doc.item_name}</td>
              <td className="num">{qty(doc.quantity)}</td>
              <td>{doc.unit_name ?? "PCS"}</td>
              {isInvoice ? <td className="num">{money(doc.rate)}</td> : null}
              {isInvoice ? <td className="num">{money(doc.amount)}</td> : null}
            </tr>
          </tbody>
          {isInvoice ? (
            <tfoot>
              <tr>
                <td colSpan={6}>Total ({currency})</td>
                <td className="num">{money(doc.amount)}</td>
              </tr>
            </tfoot>
          ) : null}
        </table>
        {isInvoice ? (
          <CustomerClosingBalance
            currency={currency}
            previous={doc.previous_balance}
            invoice={doc.invoice_balance}
            closing={doc.closing_balance}
          />
        ) : null}
        <div className="print-sign">
          <div>Prepared by</div>
          <div>{isInvoice ? "Customer acknowledgement" : "Received by"}</div>
          <div>Authorised signature</div>
        </div>
      </article>
    </div>
  );
}
