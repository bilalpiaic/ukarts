"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { AttachmentField, uploadAttachments, usePendingFiles, type SavedFile } from "../attachments";
import { Combobox, type Option } from "../combobox";
import {
  cashBankForType,
  filterAccountsForSide,
  formModeForType,
  isCashAccount,
  isBankAccount,
  normalizeManualVoucherType,
  voucherTypeForMode,
  type CashBank,
  type FilterableAccount,
  type FormMode,
  type ManualVoucherType,
} from "@/lib/vouchers";

export interface VoucherLine {
  accountCode: string;
  partyCode: string;
  debit: string;
  credit: string;
  description: string;
}

export interface AmountLine {
  accountCode: string;
  partyCode: string;
  amount: string;
  description: string;
}

const today = () => new Date().toISOString().slice(0, 10);

function blankLine(): VoucherLine {
  return { accountCode: "", partyCode: "", debit: "", credit: "", description: "" };
}

function blankAmount(): AmountLine {
  return { accountCode: "", partyCode: "", amount: "", description: "" };
}

const money = (n: number) =>
  n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function toOptions(list: FilterableAccount[]): Option[] {
  return list.map((a) => ({
    value: a.account_code,
    label: `${a.account_code} — ${a.account_name}`,
  }));
}

/** Multi-mode voucher entry: Journal (JV), Payment (CP/BP), Receipt (CR/BR). */
export function VoucherForm({
  accounts,
  parties,
  mode = "create",
  existing,
}: {
  accounts: FilterableAccount[];
  parties: Option[];
  mode?: "create" | "edit";
  existing?: {
    id: string;
    voucherDate: string;
    description: string;
    voucherType?: string;
    treasuryAccountCode?: string;
    lines: VoucherLine[];
    amountLines?: AmountLine[];
    attachments?: SavedFile[];
  };
}) {
  const router = useRouter();
  const pending = usePendingFiles();
  const [saved, setSaved] = useState<SavedFile[]>(existing?.attachments ?? []);

  const initialType = normalizeManualVoucherType(existing?.voucherType);
  const [formMode, setFormMode] = useState<FormMode>(formModeForType(initialType));
  const [cashBank, setCashBank] = useState<CashBank>(cashBankForType(initialType) ?? "cash");
  const [voucherDate, setVoucherDate] = useState(existing?.voucherDate ?? today());
  const [description, setDescription] = useState(existing?.description ?? "");
  const [treasuryAccountCode, setTreasuryAccountCode] = useState(existing?.treasuryAccountCode ?? "");
  const [lines, setLines] = useState<VoucherLine[]>(
    existing?.lines?.length
      ? existing.lines.map((l) => ({ ...l, description: (l.description ?? "").slice(0, 25) }))
      : [blankLine(), blankLine()],
  );
  const [amountLines, setAmountLines] = useState<AmountLine[]>(
    existing?.amountLines?.length ? existing.amountLines : [blankAmount()],
  );
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const voucherType: ManualVoucherType = voucherTypeForMode(formMode, cashBank);

  const cashAccounts = useMemo(() => accounts.filter(isCashAccount), [accounts]);
  const bankAccounts = useMemo(() => accounts.filter(isBankAccount), [accounts]);
  const treasuryOptions = toOptions(cashBank === "cash" ? cashAccounts : bankAccounts);
  const contraAccounts = useMemo(
    () => accounts.filter((a) => !isCashAccount(a) && !isBankAccount(a)),
    [accounts],
  );
  const contraOptions = toOptions(contraAccounts);

  const jvDebitOptions = useMemo(
    () => toOptions(filterAccountsForSide(accounts, voucherType, "debit").accounts),
    [accounts, voucherType],
  );
  const jvCreditOptions = useMemo(
    () => toOptions(filterAccountsForSide(accounts, voucherType, "credit").accounts),
    [accounts, voucherType],
  );

  const jvTotals = useMemo(() => {
    const debit = lines.reduce((s, l) => s + (Number(l.debit) || 0), 0);
    const credit = lines.reduce((s, l) => s + (Number(l.credit) || 0), 0);
    return { debit, credit, balanced: Math.abs(debit - credit) < 0.005 && debit > 0 };
  }, [lines]);

  const amountTotal = useMemo(
    () => amountLines.reduce((s, l) => s + (Number(l.amount) || 0), 0),
    [amountLines],
  );

  const treasuryReady = formMode === "journal" || (Boolean(treasuryAccountCode) && amountTotal > 0);
  const canPost = formMode === "journal" ? jvTotals.balanced : treasuryReady;

  function setLine(i: number, key: keyof VoucherLine, value: string) {
    setLines((rows) =>
      rows.map((r, idx) => {
        if (idx !== i) return r;
        const copy = { ...r, [key]: value };
        if (key === "debit" && value) copy.credit = "";
        if (key === "credit" && value) copy.debit = "";
        return copy;
      }),
    );
  }

  function setAmount(i: number, key: keyof AmountLine, value: string) {
    setAmountLines((rows) => rows.map((r, idx) => (idx === i ? { ...r, [key]: value } : r)));
  }

  function switchMode(next: FormMode) {
    setFormMode(next);
    setMsg(null);
    if (next !== "journal" && !treasuryAccountCode) {
      const opts = next === "payment" || cashBank === "cash" ? cashAccounts : bankAccounts;
      const preferred = cashBank === "bank" ? bankAccounts : cashAccounts;
      setTreasuryAccountCode((preferred[0] ?? opts[0])?.account_code ?? "");
    }
  }

  function switchCashBank(next: CashBank) {
    setCashBank(next);
    const opts = next === "cash" ? cashAccounts : bankAccounts;
    setTreasuryAccountCode(opts[0]?.account_code ?? "");
  }

  async function submit(post: boolean) {
    setBusy(true);
    setMsg(null);
    try {
      const payload =
        formMode === "journal"
          ? {
              id: existing?.id,
              voucherDate,
              description,
              post,
              voucherType: "JV",
              lines: lines
                .filter((l) => l.accountCode && (Number(l.debit) > 0 || Number(l.credit) > 0))
                .map((l) => ({
                  accountCode: l.accountCode,
                  partyCode: l.partyCode || null,
                  debit: Number(l.debit) || 0,
                  credit: Number(l.credit) || 0,
                  description: (l.description || "").trim().slice(0, 25) || null,
                })),
            }
          : {
              id: existing?.id,
              voucherDate,
              description,
              post,
              voucherType,
              treasuryAccountCode,
              lines: amountLines
                .filter((l) => l.accountCode && Number(l.amount) > 0)
                .map((l) => ({
                  accountCode: l.accountCode,
                  partyCode: l.partyCode || null,
                  amount: Number(l.amount) || 0,
                  description: (l.description || "").trim().slice(0, 25) || null,
                })),
            };
      const action = mode === "edit" ? "journal-update" : "journal-create";
      const res = await fetch(`/api/action/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Request failed");
      const journalId = String(existing?.id ?? data.journalEntryId ?? "");
      if (journalId && pending.files.length > 0) {
        await uploadAttachments("JOURNAL", journalId, pending.files.map((f) => f.file));
        pending.clear();
      }
      if (mode === "edit") {
        router.push(`/vouchers/${existing?.id}`);
        router.refresh();
        return;
      }
      if (data.journalEntryId) {
        router.push(`/vouchers/${data.journalEntryId}`);
        router.refresh();
        return;
      }
      setMsg({ kind: "ok", text: "Saved." });
      setLines([blankLine(), blankLine()]);
      setAmountLines([blankAmount()]);
      setDescription("");
      router.refresh();
    } catch (err) {
      setMsg({ kind: "err", text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  }

  const title =
    mode === "edit"
      ? `Edit ${voucherType} voucher`
      : formMode === "journal"
        ? "New Journal Voucher"
        : formMode === "payment"
          ? `New ${cashBank === "cash" ? "Cash" : "Bank"} Payment`
          : `New ${cashBank === "cash" ? "Cash" : "Bank"} Receipt`;

  return (
    <form onSubmit={(e) => e.preventDefault()}>
      <div className="voucher-form-head">
        <h2>{title}</h2>
        <span className={`vt-badge ${voucherType.toLowerCase() === "jv" ? "vt-jv" : formMode === "payment" ? "vt-pay" : "vt-rec"}`}>
          {voucherType}
        </span>
      </div>

      {mode === "create" && (
        <div className="mode-tabs">
          {(
            [
              { key: "journal" as const, label: "Journal", hint: "JV — any accounts" },
              { key: "payment" as const, label: "Payment", hint: "CP / BP — money out" },
              { key: "receipt" as const, label: "Receipt", hint: "CR / BR — money in" },
            ] as const
          ).map((tab) => (
            <button
              key={tab.key}
              type="button"
              className={`mode-tab${formMode === tab.key ? " active" : ""}`}
              onClick={() => switchMode(tab.key)}
            >
              <span className="mode-tab-label">{tab.label}</span>
              <span className="mode-tab-hint">{tab.hint}</span>
            </button>
          ))}
        </div>
      )}

      <div className="header-fields">
        {formMode !== "journal" && (
          <div className="form-row">
            <label>Instrument</label>
            <div className="segmented">
              {(["cash", "bank"] as CashBank[]).map((opt) => (
                <button
                  key={opt}
                  type="button"
                  className={cashBank === opt ? "active" : ""}
                  onClick={() => switchCashBank(opt)}
                >
                  {opt === "cash" ? "Cash" : "Bank"}
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="form-row">
          <label>Voucher date</label>
          <input type="date" value={voucherDate} onChange={(e) => setVoucherDate(e.target.value)} />
        </div>
        <div className="form-row">
          <label>Narration / description</label>
          <input
            type="text"
            value={description}
            placeholder={
              formMode === "payment"
                ? "e.g. Rent paid for July"
                : formMode === "receipt"
                  ? "e.g. Cash received from customer"
                  : "e.g. Month-end accrual"
            }
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
        {formMode !== "journal" && (
          <div className="form-row">
            <label>{formMode === "payment" ? "Pay from" : "Receive into"}</label>
            <Combobox
              options={treasuryOptions}
              value={treasuryAccountCode}
              onChange={setTreasuryAccountCode}
              placeholder={cashBank === "cash" ? "Cash in Hand" : "Bank account"}
            />
            {treasuryOptions.length === 0 && (
              <p className="muted">
                {cashBank === "cash"
                  ? "No Cash in Hand account found — add one on the Chart of Accounts."
                  : "No Bank account found — add one on the Chart of Accounts."}
              </p>
            )}
          </div>
        )}
      </div>

      {formMode === "journal" ? (
        <>
          <table className="lines-table voucher-lines">
            <colgroup>
              <col className="col-line" />
              <col className="col-account" />
              <col className="col-party" />
              <col className="col-desc" />
              <col className="col-amt" />
              <col className="col-amt" />
              <col className="col-remove" />
            </colgroup>
            <thead>
              <tr>
                <th>#</th>
                <th>Account</th>
                <th>Party (optional)</th>
                <th>Description</th>
                <th className="num">Debit</th>
                <th className="num">Credit</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l, i) => {
                const side = Number(l.debit) > 0 ? "debit" : Number(l.credit) > 0 ? "credit" : "none";
                const accountOptions =
                  side === "debit" ? jvDebitOptions : side === "credit" ? jvCreditOptions : toOptions(accounts);
                return (
                  <tr key={i}>
                    <td data-label="Line">{i + 1}</td>
                    <td data-label="Account">
                      <Combobox options={accountOptions} value={l.accountCode} onChange={(v) => setLine(i, "accountCode", v)} />
                    </td>
                    <td data-label="Party">
                      <Combobox options={parties} value={l.partyCode} onChange={(v) => setLine(i, "partyCode", v)} placeholder="—" />
                    </td>
                    <td data-label="Description">
                      <input
                        type="text"
                        maxLength={25}
                        value={l.description}
                        placeholder="Up to 25 characters"
                        aria-label={`Line ${i + 1} description`}
                        onChange={(e) => setLine(i, "description", e.target.value.slice(0, 25))}
                      />
                    </td>
                    <td className="num" data-label="Debit">
                      <input
                        type="number"
                        step="0.01"
                        value={l.debit}
                        onChange={(e) => setLine(i, "debit", e.target.value)}
                      />
                    </td>
                    <td className="num" data-label="Credit">
                      <input
                        type="number"
                        step="0.01"
                        value={l.credit}
                        onChange={(e) => setLine(i, "credit", e.target.value)}
                      />
                    </td>
                    <td data-label="">
                      <button
                        type="button"
                        className="icon-btn"
                        onClick={() => setLines((r) => (r.length > 2 ? r.filter((_, idx) => idx !== i) : r))}
                        aria-label="Remove line"
                      >
                        ×
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="line-tools">
            <button type="button" className="btn-ghost" onClick={() => setLines((r) => [...r, blankLine()])}>
              + Add line
            </button>
          </div>
          <div className="balance-strip">
            <span>Total Debit: <strong>{money(jvTotals.debit)}</strong></span>
            <span>Total Credit: <strong>{money(jvTotals.credit)}</strong></span>
            <span className={jvTotals.balanced ? "bal-ok" : "bal-bad"}>
              {jvTotals.balanced ? "Balanced ✓" : `Out of balance by ${money(Math.abs(jvTotals.debit - jvTotals.credit))}`}
            </span>
          </div>
        </>
      ) : (
        <>
          <table className="lines-table voucher-lines">
            <colgroup>
              <col className="col-line" />
              <col className="col-account" />
              <col className="col-party" />
              <col className="col-desc" />
              <col className="col-amt" />
              <col className="col-remove" />
            </colgroup>
            <thead>
              <tr>
                <th>#</th>
                <th>{formMode === "payment" ? "Debit account (paid to)" : "Credit account (received from)"}</th>
                <th>Party (optional)</th>
                <th>Description</th>
                <th className="num">Amount</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {amountLines.map((l, i) => (
                <tr key={i}>
                  <td data-label="Line">{i + 1}</td>
                  <td data-label="Account">
                    <Combobox options={contraOptions} value={l.accountCode} onChange={(v) => setAmount(i, "accountCode", v)} />
                  </td>
                  <td data-label="Party">
                    <Combobox options={parties} value={l.partyCode} onChange={(v) => setAmount(i, "partyCode", v)} placeholder="—" />
                  </td>
                  <td data-label="Description">
                    <input
                      type="text"
                      maxLength={25}
                      value={l.description}
                      placeholder="Up to 25 characters"
                      onChange={(e) => setAmount(i, "description", e.target.value.slice(0, 25))}
                    />
                  </td>
                  <td className="num" data-label="Amount">
                    <input
                      type="number"
                      step="0.01"
                      value={l.amount}
                      onChange={(e) => setAmount(i, "amount", e.target.value)}
                    />
                  </td>
                  <td data-label="">
                    <button
                      type="button"
                      className="icon-btn"
                      onClick={() => setAmountLines((r) => (r.length > 1 ? r.filter((_, idx) => idx !== i) : r))}
                      aria-label="Remove line"
                    >
                      ×
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="line-tools">
            <button type="button" className="btn-ghost" onClick={() => setAmountLines((r) => [...r, blankAmount()])}>
              + Add line
            </button>
          </div>
          <div className="balance-strip">
            <span>
              {formMode === "payment" ? "Total payment" : "Total receipt"}: <strong>{money(amountTotal)}</strong>
            </span>
            <span>
              {formMode === "payment" ? "Credit" : "Debit"} {cashBank === "cash" ? "Cash" : "Bank"}:{" "}
              <strong>{money(amountTotal)}</strong>
            </span>
            <span className={canPost ? "bal-ok" : "bal-bad"}>
              {canPost ? `${voucherType} balanced ✓` : "Select the cash/bank account and enter an amount"}
            </span>
          </div>
        </>
      )}

      <AttachmentField
        files={pending.files}
        onAdd={pending.addFiles}
        onRemove={pending.remove}
        saved={saved}
        onDeleteSaved={
          existing?.id
            ? async (id) => {
                const res = await fetch(`/api/attachments/${id}`, { method: "DELETE" });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error ?? "Could not remove file.");
                setSaved((s) => s.filter((f) => f.id !== id));
              }
            : undefined
        }
        label="Voucher attachments"
      />

      <div className="line-tools">
        <button type="button" className="btn-ghost" disabled={busy} onClick={() => submit(false)}>
          {busy ? "Saving…" : "Save as Draft"}
        </button>
        <button type="button" disabled={busy || !canPost} onClick={() => submit(true)}>
          {busy ? "Posting…" : `Post ${voucherType}`}
        </button>
      </div>
      {msg && <div className={`msg ${msg.kind}`}>{msg.text}</div>}
    </form>
  );
}
