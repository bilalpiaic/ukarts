import Link from "next/link";
import { getAllParties, getJournalEntriesList, getPostableAccounts } from "@/lib/erp";
import { money } from "@/lib/format";
import { MANUAL_VOUCHER_TYPES, VOUCHER_TYPES, displayVoucherType } from "@/lib/vouchers";
import { AttachmentChips } from "../attachments";
import { PrintButton } from "../print-button";
import { PrintOrgHeader } from "../print-header";
import { VoucherForm } from "./voucher-form";

export const dynamic = "force-dynamic";

export default async function Vouchers({
  searchParams,
}: {
  searchParams: Promise<{ type?: string }>;
}) {
  const { type } = await searchParams;
  const filter = (type ?? "").toUpperCase();
  const [accounts, parties, list] = await Promise.all([
    getPostableAccounts(),
    getAllParties(),
    getJournalEntriesList(undefined, filter || undefined),
  ]);

  const partyOptions = parties.map((p) => ({ value: p.party_code, label: p.party_name }));

  const chips = [
    { code: "", label: "All" },
    ...MANUAL_VOUCHER_TYPES.map((code) => ({ code, label: `${code} · ${VOUCHER_TYPES[code]}` })),
    { code: "SYSTEM", label: "System" },
  ];

  return (
    <div className="container">
      <PrintOrgHeader title="Journal Vouchers" />
      <div className="page-head">
        <div>
          <h1 className="page-title">Vouchers</h1>
          <p className="subtitle">Cash / Bank receipts and payments, plus general journal — same series as Easy-Books.</p>
        </div>
        <PrintButton />
      </div>

      <div className="grid">
        <div className="card full">
          <VoucherForm accounts={accounts} parties={partyOptions} />
        </div>

        <div className="card full">
          <div className="register-head">
            <h2>Voucher Register</h2>
            <div className="type-chips no-print">
              {chips.map((c) => {
                const href = c.code ? `/vouchers?type=${c.code}` : "/vouchers";
                const active = (filter || "") === c.code;
                return (
                  <Link key={c.code || "all"} href={href} className={`type-chip${active ? " active" : ""}`}>
                    {c.label}
                  </Link>
                );
              })}
            </div>
          </div>
          {list.length === 0 ? (
            <p className="subtitle">No vouchers yet.</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Voucher</th>
                  <th>Date</th>
                  <th>Type</th>
                  <th>Status</th>
                  <th className="num">Amount</th>
                  <th>Docs</th>
                </tr>
              </thead>
              <tbody>
                {list.map((v) => {
                  const vt = displayVoucherType(v.voucher_type);
                  return (
                    <tr key={v.id}>
                      <td>
                        <Link className="src-link" href={`/vouchers/${v.id}`}>
                          {v.voucher_number}
                        </Link>
                      </td>
                      <td>{v.voucher_date}</td>
                      <td>
                        <span className={`vt-badge ${vt.className}`} title={vt.label}>
                          {vt.code}
                        </span>
                      </td>
                      <td>
                        <span className={`pill ${v.status.toLowerCase()}`}>{v.status}</span>
                      </td>
                      <td className="num">{money(v.total)}</td>
                      <td>
                        <AttachmentChips entityType="JOURNAL" entityId={v.id} count={v.attach_count} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
