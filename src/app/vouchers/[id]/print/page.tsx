import Link from "next/link";
import { notFound } from "next/navigation";
import { getJournalEntry, getOrganization } from "@/lib/erp";
import { money } from "@/lib/format";
import { displayVoucherType } from "@/lib/vouchers";
import { PrintButton } from "../../../print-button";

export const dynamic = "force-dynamic";

export default async function VoucherPrint({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [detail, org] = await Promise.all([getJournalEntry(id), getOrganization()]);
  if (!detail.header) notFound();
  const h = detail.header;
  const vt = displayVoucherType(h.voucher_type);
  const contact = [org?.phone, org?.email].filter(Boolean).join(" · ");

  return (
    <div className="print-page">
      <div className="print-toolbar no-print">
        <PrintButton label="Print Voucher" />
        <Link className="btn-ghost" href={`/vouchers/${h.id}`}>
          Back to voucher
        </Link>
      </div>
      <article className="print-sheet">
        <header className="print-sheet-org">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="" width={64} height={64} />
          <div>
            <h1>{org?.name ?? "U.K Arts"}</h1>
            {org?.address ? <div>{org.address}</div> : null}
            {contact ? <div>{contact}</div> : null}
          </div>
        </header>
        <div className="print-sheet-banner">
          {vt.label.toUpperCase()} · {vt.code}
        </div>
        <div className="print-sheet-meta">
          <div>
            <div className="k">Voucher No.</div>
            <div className="v">{h.voucher_number}</div>
          </div>
          <div>
            <div className="k">Date</div>
            <div className="v">{h.voucher_date}</div>
          </div>
          <div>
            <div className="k">Status</div>
            <div className="v">{h.status}</div>
          </div>
          <div>
            <div className="k">Narration</div>
            <div className="v">{h.description ?? "—"}</div>
          </div>
        </div>
        <table className="print-sheet-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Account</th>
              <th>Party</th>
              <th>Description</th>
              <th className="num">Debit</th>
              <th className="num">Credit</th>
            </tr>
          </thead>
          <tbody>
            {detail.lines.map((l) => (
              <tr key={l.line_number}>
                <td>{l.line_number}</td>
                <td>
                  {l.account_code} — {l.account_name}
                </td>
                <td>{l.party_name ?? ""}</td>
                <td>{l.description ?? ""}</td>
                <td className="num">{Number(l.debit) ? money(l.debit) : ""}</td>
                <td className="num">{Number(l.credit) ? money(l.credit) : ""}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={4}>Total ({org?.currency ?? "PKR"})</td>
              <td className="num">{money(detail.totalDebit)}</td>
              <td className="num">{money(detail.totalCredit)}</td>
            </tr>
          </tfoot>
        </table>
        <div className="print-sign">
          <div>Prepared by</div>
          <div>Checked by</div>
          <div>Authorised signature</div>
        </div>
      </article>
    </div>
  );
}
