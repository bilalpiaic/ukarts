export function DispatchPrintLinks({
  dispatchId,
  journalEntryId,
}: {
  dispatchId: string;
  journalEntryId?: string | null;
}) {
  return (
    <div className="row-actions no-print">
      <a className="btn-ghost" href={`/sales/dispatches/${dispatchId}/do?plain=1`} target="_blank" rel="noreferrer">
        Print DO
      </a>
      <a className="btn-ghost" href={`/sales/dispatches/${dispatchId}/invoice?plain=1`} target="_blank" rel="noreferrer">
        Print Invoice
      </a>
      {journalEntryId ? (
        <a className="btn-ghost" href={`/vouchers/${journalEntryId}/print?plain=1`} target="_blank" rel="noreferrer">
          Print Voucher
        </a>
      ) : null}
    </div>
  );
}
