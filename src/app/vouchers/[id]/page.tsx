import Link from "next/link";
import { notFound } from "next/navigation";
import { getSession, isAdmin } from "@/lib/auth";
import { listAttachments } from "@/lib/attachments";
import { getJournalEntry, getOrganization } from "@/lib/erp";
import { money } from "@/lib/format";
import { AttachmentChips, SavedAttachmentList } from "../../attachments";
import { PrintButton } from "../../print-button";
import { VoucherActions } from "../voucher-actions";

export const dynamic = "force-dynamic";

export default async function VoucherDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [detail, org, session, files] = await Promise.all([
    getJournalEntry(id),
    getOrganization(),
    getSession(),
    listAttachments("JOURNAL", id),
  ]);
  if (!detail.header) notFound();
  const h = detail.header;
  const admin = isAdmin(session);

  return (
    <div className="container">
      <div className="print-header">
        <h2 style={{ margin: 0 }}>{org?.name ?? "U.K Arts"}</h2>
        <div>{org?.address}</div>
        <div>Journal Voucher — {h.voucher_number}</div>
        <hr />
      </div>

      <div className="page-head">
        <h1 className="page-title">
          Voucher {h.voucher_number}{" "}
          <span className={`pill ${h.status.toLowerCase()}`}>{h.status}</span>
        </h1>
        <div className="row-actions no-print">
          <Link className="btn-ghost" href="/vouchers">
            ← Register
          </Link>
          <PrintButton />
        </div>
      </div>

      <VoucherActions id={h.id} status={h.status} editable={detail.editable} isAdmin={admin} />

      <div className="card full">
        <div className="doc-meta">
          <div>
            <div className="k">Voucher No.</div>
            <div className="v">{h.voucher_number}</div>
          </div>
          <div>
            <div className="k">Date</div>
            <div className="v">{h.voucher_date}</div>
          </div>
          <div>
            <div className="k">Type</div>
            <div className="v">{h.voucher_type}</div>
          </div>
          <div>
            <div className="k">Source</div>
            <div className="v">{h.reference_type ?? "—"}</div>
          </div>
          <div>
            <div className="k">Narration</div>
            <div className="v">{h.description ?? "—"}</div>
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th style={{ width: 30 }}>#</th>
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
                <td>{l.account_name}</td>
                <td>{l.party_name ?? "—"}</td>
                <td>{l.description ?? "—"}</td>
                <td className="num">{Number(l.debit) ? money(l.debit) : ""}</td>
                <td className="num">{Number(l.credit) ? money(l.credit) : ""}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={4}>Total</td>
              <td className="num">{money(detail.totalDebit)}</td>
              <td className="num">{money(detail.totalCredit)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="card full no-print">
        <h2>Attachments</h2>
        {files.length === 0 ? (
          <p className="subtitle">No files on this voucher.</p>
        ) : (
          <SavedAttachmentList files={files} />
        )}
      </div>
    </div>
  );
}
