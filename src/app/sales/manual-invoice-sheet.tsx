import type { CustomerBalance, ManualInvoiceDocument, Organization } from "@/lib/erp";
import { formatDocDate, money, qty } from "@/lib/format";
import { salesPaymentLabel } from "@/lib/sales-invoice";
import { PrintButton } from "../print-button";
import { CustomerClosingBalance } from "./customer-balance";
import { InvoiceAdminActions } from "./invoice-admin-actions";
import { ManualInvoicePrintLinks } from "./manual-print-links";

export function ManualInvoiceSheet({
  org,
  doc,
  admin = false,
}: {
  org: Organization | null;
  doc: ManualInvoiceDocument & CustomerBalance;
  admin?: boolean;
}) {
  const currency = org?.currency ?? "PKR";
  const contact = [org?.phone, org?.email].filter(Boolean).join(" · ");
  const discount = Number(doc.discount_amount);
  const tax = Number(doc.tax_amount);

  return (
    <div className="print-page">
      <div className="print-toolbar no-print">
        <PrintButton label="Print Sales Invoice" />
        <ManualInvoicePrintLinks invoiceId={doc.id} journalEntryId={doc.journal_entry_id} />
        {admin ? (
          <InvoiceAdminActions
            editHref={`/sales/invoices/${doc.id}/edit`}
            endpoint="/api/admin/manual-sales-delete"
            invoiceId={doc.id}
            confirmText="Delete this manual sales invoice and its voucher? This cannot be undone."
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
        <div className="print-sheet-banner">MANUAL SALES INVOICE</div>
        <div className="print-sheet-meta">
          <div>
            <div className="k">Invoice No.</div>
            <div className="v">{doc.invoice_number}</div>
          </div>
          <div>
            <div className="k">Date</div>
            <div className="v">{formatDocDate(doc.invoice_date)}</div>
          </div>
          <div>
            <div className="k">Payment</div>
            <div className="v">{salesPaymentLabel(doc.payment_type)}</div>
          </div>
        </div>
        <div className="print-sheet-party">
          <div className="k">Customer</div>
          <div className="v">{doc.customer_name}</div>
          {doc.customer_address ? <div>{doc.customer_address}</div> : null}
          {doc.customer_phone ? <div>{doc.customer_phone}</div> : null}
          {doc.narration ? <div className="print-pay">{doc.narration}</div> : null}
        </div>
        <table className="print-sheet-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Description</th>
              <th className="num">Qty</th>
              <th className="num">Rate</th>
              <th className="num">Amount</th>
            </tr>
          </thead>
          <tbody>
            {doc.lines.map((line) => (
              <tr key={line.line_number}>
                <td>{line.line_number}</td>
                <td>{line.description}</td>
                <td className="num">{qty(line.quantity)}</td>
                <td className="num">{money(line.rate)}</td>
                <td className="num">{money(line.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="print-totals">
          <div>
            <span>Goods total</span>
            <span>{money(doc.gross_amount)}</span>
          </div>
          {discount > 0 ? (
            <div>
              <span>Less: Discount Allowed</span>
              <span>{money(doc.discount_amount)}</span>
            </div>
          ) : null}
          {tax > 0 ? (
            <div>
              <span>Add: Sales Tax Payable</span>
              <span>{money(doc.tax_amount)}</span>
            </div>
          ) : null}
          <div className="grand">
            <span>Net receivable ({currency})</span>
            <span>{money(doc.net_amount)}</span>
          </div>
        </div>
        <CustomerClosingBalance
          currency={currency}
          previous={doc.previous_balance}
          invoice={doc.invoice_balance}
          closing={doc.closing_balance}
        />
        <div className="print-sign">
          <div>Prepared by</div>
          <div>Customer acknowledgement</div>
          <div>Authorised signature</div>
        </div>
      </article>
    </div>
  );
}
