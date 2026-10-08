import { money } from "@/lib/format";

export function CustomerClosingBalance({
  currency,
  previous,
  invoice,
  closing,
}: {
  currency: string;
  previous: string;
  invoice: string;
  closing: string;
}) {
  return (
    <div className="print-totals">
      <div>
        <span>Previous balance</span>
        <span>{money(previous)}</span>
      </div>
      <div>
        <span>This invoice</span>
        <span>{money(invoice)}</span>
      </div>
      <div className="grand">
        <span>Customer closing balance ({currency})</span>
        <span>{money(closing)}</span>
      </div>
    </div>
  );
}
