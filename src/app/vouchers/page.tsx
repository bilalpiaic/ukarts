import Link from "next/link";
import { getAllParties, getJournalEntriesList, getPostableAccounts } from "@/lib/erp";
import { money } from "@/lib/format";
import { AttachmentChips } from "../attachments";
import { PrintButton } from "../print-button";
import { VoucherForm } from "./voucher-form";

export const dynamic = "force-dynamic";

export default async function Vouchers() {
  const [accounts, parties, list] = await Promise.all([
    getPostableAccounts(),
    getAllParties(),
    getJournalEntriesList(),
  ]);

  const accountOptions = accounts.map((a) => ({
    value: a.account_code,
    label: `${a.account_code} — ${a.account_name}`,
  }));
  const partyOptions = parties.map((p) => ({ value: p.party_code, label: p.party_name }));

  return (
    <div className="container">
      <div className="page-head">
        <h1 className="page-title">Journal Vouchers</h1>
        <PrintButton />
      </div>

      <div className="grid">
        <div className="card full">
          <VoucherForm accounts={accountOptions} parties={partyOptions} />
        </div>

        <div className="card full">
          <h2>Voucher Register</h2>
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
                {list.map((v) => (
                  <tr key={v.id}>
                    <td>
                      <Link className="src-link" href={`/vouchers/${v.id}`}>
                        {v.voucher_number}
                      </Link>
                    </td>
                    <td>{v.voucher_date}</td>
                    <td>{v.voucher_type}</td>
                    <td>
                      <span className={`pill ${v.status.toLowerCase()}`}>{v.status}</span>
                    </td>
                    <td className="num">{money(v.total)}</td>
                    <td>
                      <AttachmentChips entityType="JOURNAL" entityId={v.id} count={v.attach_count} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
