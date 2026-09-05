import Link from "next/link";
import { notFound } from "next/navigation";
import { getAccountLedger, getOrganization } from "@/lib/erp";
import { money } from "@/lib/format";
import { PrintButton } from "../../print-button";

export const dynamic = "force-dynamic";

export default async function AccountLedger({
  params,
  searchParams,
}: {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const { code } = await params;
  const { from, to } = await searchParams;
  const [ledger, org] = await Promise.all([
    getAccountLedger(decodeURIComponent(code), { from, to }),
    getOrganization(),
  ]);
  if (!ledger.account) notFound();

  let running = 0;

  return (
    <div className="container">
      <div className="print-header">
        <h2 style={{ margin: 0 }}>{org?.name ?? "U.K Arts"}</h2>
        <div>Account Ledger — {ledger.account.account_code} {ledger.account.account_name}</div>
        <hr />
      </div>

      <div className="page-head">
        <h1 className="page-title">
          {ledger.account.account_code} · {ledger.account.account_name}
          <span className="pill" style={{ marginLeft: 8 }}>{ledger.account.account_type}</span>
        </h1>
        <div className="row-actions no-print">
          <Link className="btn-ghost" href="/reports">← Reports</Link>
          <PrintButton />
        </div>
      </div>

      <div className="card full">
        <h2>Postings</h2>
        {ledger.rows.length === 0 ? (
          <p className="subtitle">No posted entries for this account.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Voucher</th>
                <th>Date</th>
                <th>Party</th>
                <th>Description</th>
                <th className="num">Debit</th>
                <th className="num">Credit</th>
                <th className="num">Balance</th>
              </tr>
            </thead>
            <tbody>
              {ledger.rows.map((r) => {
                running += Number(r.debit) - Number(r.credit);
                return (
                  <tr key={`${r.id}-${r.voucher_number}-${running}`}>
                    <td>
                      <Link className="src-link" href={`/vouchers/${r.id}`}>
                        {r.voucher_number}
                      </Link>
                    </td>
                    <td>{r.voucher_date}</td>
                    <td>{r.party_name ?? "—"}</td>
                    <td>{r.description ?? "—"}</td>
                    <td className="num">{Number(r.debit) ? money(r.debit) : ""}</td>
                    <td className="num">{Number(r.credit) ? money(r.credit) : ""}</td>
                    <td className="num">{money(running)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
