export function ManualInvoicePrintLinks({
  invoiceId,
  journalEntryId,
}: {
  invoiceId: string;
  journalEntryId?: string | null;
}) {
  return (
    <div className="row-actions no-print">
      <a
        className="btn-ghost"
        href={`/sales/invoices/${invoiceId}/print?plain=1`}
        target="_blank"
        rel="noreferrer"
      >
        Print invoice
      </a>
      {journalEntryId ? (
        <a
          className="btn-ghost"
          href={`/vouchers/${journalEntryId}/print?plain=1`}
          target="_blank"
          rel="noreferrer"
        >
          Print voucher
        </a>
      ) : null}
    </div>
  );
}
