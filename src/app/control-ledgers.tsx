import Link from "next/link";
import type { ControlLedgerGroup, TrialBalanceRow } from "@/lib/erp";
import { money } from "@/lib/format";

function sideLabel(g: ControlLedgerGroup, amount: number): string {
  if (Math.abs(amount) < 0.005) return money(0);
  if (g.normal_side === "DEBIT") {
    return amount >= 0 ? `${money(amount)} Dr` : `${money(-amount)} Cr`;
  }
  return amount >= 0 ? `${money(amount)} Cr` : `${money(-amount)} Dr`;
}

export function ControlLedgerComposition({
  groups,
  qs = "",
  title = "Control / Sub Ledgers",
  emptyHint = "Add customers, vendors, and processors in COA. Their balances compose the control accounts.",
}: {
  groups: ControlLedgerGroup[];
  qs?: string;
  title?: string;
  emptyHint?: string;
}) {
  return (
    <div className="card full">
      <h2>{title}</h2>
      {!groups.length ? (
        <p className="subtitle">{emptyHint}</p>
      ) : (
        groups.map((g) => (
          <ControlLedgerBlock key={g.account_code} group={g} qs={qs} />
        ))
      )}
    </div>
  );
}

export function ControlLedgerBlock({
  group: g,
  qs = "",
}: {
  group: ControlLedgerGroup;
  qs?: string;
}) {
  return (
    <div className="control-block">
      <div className="control-block-head">
        <h3>
          <Link className="src-link" href={`/accounts/${encodeURIComponent(g.account_code)}${qs}`}>
            {g.account_code} · {g.account_name}
          </Link>{" "}
          <span className="pill">{g.caption}</span>
        </h3>
        <span className={g.composed ? "compose-ok" : "compose-bad"}>
          {g.composed ? "Composed ✓" : "Out of composition"}
        </span>
      </div>
      <table>
        <thead>
          <tr>
            <th>Ledger</th>
            <th className="num">Debit</th>
            <th className="num">Credit</th>
            <th className="num">Balance</th>
          </tr>
        </thead>
        <tbody>
          <tr className="ledger-control">
            <td>
              Control · {g.caption}
            </td>
            <td className="num">{money(g.debit)}</td>
            <td className="num">{money(g.credit)}</td>
            <td className="num">{sideLabel(g, g.control_balance)}</td>
          </tr>
          {g.subs.length === 0 && Math.abs(g.unallocated) < 0.005 && (
            <tr className="ledger-sub">
              <td colSpan={4} className="muted">
                No {g.caption.toLowerCase()} sub-ledgers yet.
              </td>
            </tr>
          )}
          {g.subs.map((s) => (
            <tr key={s.party_code} className="ledger-sub">
              <td>
                <Link className="src-link" href={`/parties/${encodeURIComponent(s.party_code)}${qs}`}>
                  {s.party_name}
                </Link>
                <span className="muted"> · {s.party_code}</span>
              </td>
              <td className="num">{s.debit ? money(s.debit) : ""}</td>
              <td className="num">{s.credit ? money(s.credit) : ""}</td>
              <td className="num">{sideLabel(g, s.balance)}</td>
            </tr>
          ))}
          {Math.abs(g.unallocated) >= 0.005 && (
            <tr className="ledger-sub">
              <td>Unallocated (no party)</td>
              <td className="num">{g.unallocated_debit ? money(g.unallocated_debit) : ""}</td>
              <td className="num">{g.unallocated_credit ? money(g.unallocated_credit) : ""}</td>
              <td className="num">{sideLabel(g, g.unallocated)}</td>
            </tr>
          )}
        </tbody>
        <tfoot>
          <tr>
            <td>Sub-ledgers {Math.abs(g.unallocated) >= 0.005 ? "+ unallocated" : ""}</td>
            <td />
            <td />
            <td className="num">{sideLabel(g, g.sub_total + g.unallocated)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

/** Trial balance with indented sub-ledgers under control accounts (subs do not add to totals). */
export function TrialBalanceWithSubs({
  rows,
  totalDebit,
  totalCredit,
  qs = "",
  groups,
}: {
  rows: TrialBalanceRow[];
  totalDebit: number;
  totalCredit: number;
  qs?: string;
  groups: ControlLedgerGroup[];
}) {
  const byCode = new Map(groups.map((g) => [g.account_code, g]));
  return (
    <table>
      <thead>
        <tr>
          <th>Code</th>
          <th>Account</th>
          <th>Type</th>
          <th className="num">Debit</th>
          <th className="num">Credit</th>
        </tr>
      </thead>
      <tbody>
        {rows.flatMap((r) => {
          const g = byCode.get(r.account_code);
          const main = (
            <tr key={r.account_code} className={g ? "ledger-control" : undefined}>
              <td>
                <Link className="src-link" href={`/accounts/${encodeURIComponent(r.account_code)}${qs}`}>
                  {r.account_code}
                </Link>
              </td>
              <td>
                {r.account_name}
                {g ? <span className="pill" style={{ marginLeft: 8 }}>Control · {g.caption}</span> : null}
              </td>
              <td>{r.account_type}</td>
              <td className="num">{money(r.debit)}</td>
              <td className="num">{money(r.credit)}</td>
            </tr>
          );
          const activeSubs = g?.subs.filter((s) => Math.abs(s.debit) >= 0.005 || Math.abs(s.credit) >= 0.005) ?? [];
          const showUnalloc = g ? Math.abs(g.unallocated) >= 0.005 : false;
          if (!g || (activeSubs.length === 0 && !showUnalloc)) return [main];
          return [
            main,
            ...activeSubs.map((s) => (
              <tr key={`${r.account_code}-${s.party_code}`} className="ledger-sub">
                <td />
                <td>
                  <Link className="src-link" href={`/parties/${encodeURIComponent(s.party_code)}${qs}`}>
                    {s.party_name}
                  </Link>
                </td>
                <td className="muted">Sub-ledger</td>
                <td className="num">{s.debit ? money(s.debit) : ""}</td>
                <td className="num">{s.credit ? money(s.credit) : ""}</td>
              </tr>
            )),
            ...(showUnalloc
              ? [
                  <tr key={`${r.account_code}-unallocated`} className="ledger-sub">
                    <td />
                    <td>Unallocated (no party)</td>
                    <td className="muted">Sub-ledger</td>
                    <td className="num">{g.unallocated_debit ? money(g.unallocated_debit) : ""}</td>
                    <td className="num">{g.unallocated_credit ? money(g.unallocated_credit) : ""}</td>
                  </tr>,
                ]
              : []),
          ];
        })}
      </tbody>
      <tfoot>
        <tr>
          <td colSpan={3}>Total</td>
          <td className="num">{money(totalDebit)}</td>
          <td className="num">{money(totalCredit)}</td>
        </tr>
      </tfoot>
    </table>
  );
}
