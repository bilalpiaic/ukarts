import Link from "next/link";
import { notFound } from "next/navigation";
import { getControlLedgers, getOrganization, getPartyLedgerDetail } from "@/lib/erp";
import { money } from "@/lib/format";
import { PrintButton } from "../../print-button";
import { PrintHeader } from "../../print-header";

export const dynamic = "force-dynamic";

export default async function PartyLedger({
  params,
  searchParams,
}: {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const { code } = await params;
  const { from, to } = await searchParams;
  const [ledger, org, controls] = await Promise.all([
    getPartyLedgerDetail(decodeURIComponent(code), { from, to }),
    getOrganization(),
    getControlLedgers({ from, to }, { includeZeroParties: true }),
  ]);
  if (!ledger.party) notFound();
  const partyCode = ledger.party.party_code;
  const memberships = controls.filter((g) => g.subs.some((s) => s.party_code === partyCode));

  let running = 0;

  return (
    <div className="container">
      <PrintHeader org={org} title={`Party Ledger — ${ledger.party.party_name}`} />

      <div className="page-head">
        <h1 className="page-title">{ledger.party.party_name}</h1>
        <div className="row-actions no-print">
          <Link className="btn-ghost" href="/reports">← Reports</Link>
          <PrintButton />
        </div>
      </div>

      {memberships.length > 0 && (
        <p className="subtitle">
          Sub-ledger of{" "}
          {memberships.map((g, i) => (
            <span key={g.account_code}>
              {i > 0 ? ", " : ""}
              <Link className="src-link" href={`/accounts/${encodeURIComponent(g.account_code)}`}>
                {g.account_code} {g.account_name}
              </Link>
              {` (${g.caption})`}
            </span>
          ))}
        </p>
      )}

      <div className="card full">
        <h2>Postings</h2>
        {ledger.rows.length === 0 ? (
          <p className="subtitle">No posted entries for this party.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Voucher</th>
                <th>Date</th>
                <th>Account</th>
                <th>Description</th>
                <th className="num">Debit</th>
                <th className="num">Credit</th>
                <th className="num">Balance</th>
              </tr>
            </thead>
            <tbody>
              {ledger.rows.map((r) => {
                running += Number(r.credit) - Number(r.debit);
                return (
                  <tr key={`${r.id}-${r.voucher_number}-${running}`}>
                    <td>
                      <Link className="src-link" href={`/vouchers/${r.id}`}>
                        {r.voucher_number}
                      </Link>
                    </td>
                    <td>{r.voucher_date}</td>
                    <td>{r.account_name}</td>
                    <td>{r.description ?? "—"}</td>
                    <td className="num">{Number(r.debit) ? money(r.debit) : ""}</td>
                    <td className="num">{Number(r.credit) ? money(r.credit) : ""}</td>
                    <td className="num">
                      {running >= 0 ? `${money(running)} Cr` : `${money(-running)} Dr`}
                    </td>
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
