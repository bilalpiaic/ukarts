import { notFound, redirect } from "next/navigation";
import { listAttachments } from "@/lib/attachments";
import { getAllParties, getJournalEntry, getPostableAccounts } from "@/lib/erp";
import { formModeForType, normalizeManualVoucherType, splitCashBankLines } from "@/lib/vouchers";
import { VoucherForm } from "../../voucher-form";

export const dynamic = "force-dynamic";

export default async function EditVoucher({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [detail, accounts, parties, attachments] = await Promise.all([
    getJournalEntry(id),
    getPostableAccounts(),
    getAllParties(),
    listAttachments("JOURNAL", id),
  ]);
  if (!detail.header) notFound();
  if (!detail.editable) redirect(`/vouchers/${id}`);

  const partyOptions = parties.map((p) => ({ value: p.party_code, label: p.party_name }));
  const voucherType = normalizeManualVoucherType(detail.header.voucher_type);
  const mappedLines = detail.lines.map((l) => ({
    accountCode: l.account_code,
    partyCode: l.party_code ?? "",
    debit: Number(l.debit) || 0,
    credit: Number(l.credit) || 0,
    description: l.description,
  }));
  const split =
    formModeForType(voucherType) === "journal" ? null : splitCashBankLines(voucherType, mappedLines);

  const existing = {
    id: detail.header.id,
    voucherDate: detail.header.voucher_date,
    description: detail.header.description ?? "",
    voucherType,
    treasuryAccountCode: split?.treasuryAccountCode ?? "",
    lines: detail.lines.map((l) => ({
      accountCode: l.account_code,
      partyCode: l.party_code ?? "",
      debit: Number(l.debit) ? String(l.debit) : "",
      credit: Number(l.credit) ? String(l.credit) : "",
      description: l.description ?? "",
    })),
    amountLines: split?.lines.map((l) => ({
      accountCode: l.accountCode,
      partyCode: l.partyCode ?? "",
      amount: l.amount ? String(l.amount) : "",
      description: l.description ?? "",
    })),
    attachments,
  };

  return (
    <div className="container">
      <h1 className="page-title">Edit Voucher {detail.header.voucher_number}</h1>
      <div className="card full">
        <VoucherForm accounts={accounts} parties={partyOptions} mode="edit" existing={existing} />
      </div>
    </div>
  );
}
