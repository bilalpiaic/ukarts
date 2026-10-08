/**
 * Voucher series catalog — mirrors Easy-Books (CR / CP / BR / BP / JV).
 *
 * Manual journal entry uses three modes:
 *   Journal  → JV
 *   Payment  → CP (cash) or BP (bank)
 *   Receipt  → CR (cash) or BR (bank)
 *
 * Number format: `{TYPE}-{seq:06d}` e.g. `CR-000001`.
 */

export const MANUAL_VOUCHER_TYPES = ["JV", "CP", "CR", "BP", "BR"] as const;
export type ManualVoucherType = (typeof MANUAL_VOUCHER_TYPES)[number];

export const VOUCHER_TYPES: Record<string, string> = {
  JV: "Journal Voucher",
  CP: "Cash Payment",
  CR: "Cash Receipt",
  BP: "Bank Payment",
  BR: "Bank Receipt",
};

export const VOUCHER_TYPE_COLORS: Record<string, string> = {
  JV: "vt-jv",
  CP: "vt-pay",
  CR: "vt-rec",
  BP: "vt-pay",
  BR: "vt-rec",
};

export type FormMode = "journal" | "payment" | "receipt";
export type CashBank = "cash" | "bank";

export type AccountCategory = "ASSET" | "LIABILITY" | "EQUITY" | "INCOME" | "EXPENSE" | "cash" | "bank";

export interface SideFilter {
  debit: AccountCategory[];
  credit: AccountCategory[];
}

/** Smart account-head filtering — same rules as Easy-Books. */
export const VOUCHER_SIDE_FILTERS: Record<string, SideFilter> = {
  CP: { debit: ["EXPENSE", "LIABILITY", "ASSET"], credit: ["cash"] },
  BP: { debit: ["EXPENSE", "LIABILITY", "ASSET"], credit: ["bank"] },
  CR: { debit: ["cash"], credit: ["INCOME", "ASSET", "EQUITY"] },
  BR: { debit: ["bank"], credit: ["INCOME", "ASSET", "EQUITY"] },
};

export interface FilterableAccount {
  account_code: string;
  account_name: string;
  account_type: string;
  cash_bank?: string | null;
}

export function isManualVoucherType(value: string | null | undefined): value is ManualVoucherType {
  return !!value && (MANUAL_VOUCHER_TYPES as readonly string[]).includes(value);
}

export function normalizeManualVoucherType(value: string | null | undefined): ManualVoucherType {
  if (!value || value === "MANUAL") return "JV";
  const code = value.trim().toUpperCase();
  if (isManualVoucherType(code)) return code;
  throw new Error(
    `Voucher type must be one of ${MANUAL_VOUCHER_TYPES.join(", ")}. Document-backed types cannot be keyed by hand.`,
  );
}

export function formModeForType(type: string): FormMode {
  const t = normalizeManualVoucherType(type);
  if (t === "CP" || t === "BP") return "payment";
  if (t === "CR" || t === "BR") return "receipt";
  return "journal";
}

export function voucherTypeForMode(mode: FormMode, cashBank: CashBank = "cash"): ManualVoucherType {
  if (mode === "payment") return cashBank === "cash" ? "CP" : "BP";
  if (mode === "receipt") return cashBank === "cash" ? "CR" : "BR";
  return "JV";
}

export function cashBankForType(type: string): CashBank | null {
  if (type === "CP" || type === "CR") return "cash";
  if (type === "BP" || type === "BR") return "bank";
  return null;
}

export function formatVoucherNumber(type: string, seq: number): string {
  const code = isManualVoucherType(type) ? type : "JV";
  return `${code}-${String(seq).padStart(6, "0")}`;
}

export function displayVoucherType(type: string): { code: string; label: string; className: string } {
  const code = type === "MANUAL" ? "JV" : type;
  const label = VOUCHER_TYPES[code] ?? code.replaceAll("_", " ");
  const className = VOUCHER_TYPE_COLORS[code] ?? "vt-sys";
  return { code, label, className };
}

export function isCashAccount(a: FilterableAccount): boolean {
  if (a.cash_bank === "CASH") return true;
  if (a.cash_bank === "BANK") return false;
  const name = a.account_name.toLowerCase();
  if (name.includes("bank")) return false;
  if (name.includes("cash")) return true;
  return a.account_code.startsWith("100") && !a.account_code.startsWith("101");
}

export function isBankAccount(a: FilterableAccount): boolean {
  if (a.cash_bank === "BANK") return true;
  if (a.cash_bank === "CASH") return false;
  const name = a.account_name.toLowerCase();
  if (name.includes("bank")) return true;
  return a.account_code.startsWith("101") || a.account_code.startsWith("150");
}

function matchesCategory(a: FilterableAccount, cat: AccountCategory): boolean {
  switch (cat) {
    case "cash":
      return isCashAccount(a);
    case "bank":
      return isBankAccount(a);
    default:
      return a.account_type === cat;
  }
}

const EMPTY_HINTS: Record<string, string> = {
  cash: "No Cash in Hand account found — add one in Chart of Accounts",
  bank: "No Bank account found — add one in Chart of Accounts",
};

export function filterAccountsForSide<T extends FilterableAccount>(
  accounts: T[],
  voucherType: string,
  side: "debit" | "credit",
  excludeCodes?: ReadonlySet<string>,
): { accounts: T[]; emptyReason?: string } {
  const filter = VOUCHER_SIDE_FILTERS[voucherType];
  if (!filter) return { accounts };

  const categories = filter[side];
  const filtered = accounts.filter(
    (a) =>
      (!excludeCodes || !excludeCodes.has(a.account_code)) &&
      categories.some((cat) => matchesCategory(a, cat)),
  );

  if (filtered.length === 0) {
    const primary = categories[0];
    return {
      accounts: [],
      emptyReason: EMPTY_HINTS[primary] ?? `No ${categories.join(" / ")} account found — add one in Chart of Accounts`,
    };
  }
  return { accounts: filtered };
}

export interface AmountLine {
  accountCode: string;
  partyCode?: string | null;
  amount: number;
  description?: string | null;
}

export interface DebitCreditLine {
  accountCode: string;
  partyCode?: string | null;
  debit: number;
  credit: number;
  description?: string | null;
}

/**
 * Expand a payment/receipt form into balanced debit/credit lines.
 * Payment: debit contra accounts, credit cash/bank for the total.
 * Receipt: debit cash/bank for the total, credit contra accounts.
 */
export function expandCashBankLines(input: {
  voucherType: ManualVoucherType;
  treasuryAccountCode: string;
  lines: AmountLine[];
}): DebitCreditLine[] {
  const type = input.voucherType;
  if (type === "JV") {
    throw new Error("Journal vouchers use debit/credit lines, not a cash/bank offset.");
  }
  const contra = input.lines
    .map((l) => ({
      accountCode: l.accountCode,
      partyCode: l.partyCode || null,
      amount: round2(Number(l.amount ?? 0)),
      description: (l.description ?? "").trim().slice(0, 25) || null,
    }))
    .filter((l) => l.accountCode && l.amount > 0);

  if (contra.length === 0) {
    throw new Error("Enter at least one account and amount.");
  }
  if (!input.treasuryAccountCode) {
    throw new Error(
      type === "CP" || type === "BP"
        ? "Select the cash/bank account to pay from."
        : "Select the cash/bank account to receive into.",
    );
  }
  if (contra.some((l) => l.accountCode === input.treasuryAccountCode)) {
    throw new Error("The cash/bank account cannot also appear as a line account.");
  }

  const total = round2(contra.reduce((s, l) => s + l.amount, 0));
  const isPayment = type === "CP" || type === "BP";

  const contraLines: DebitCreditLine[] = contra.map((l) => ({
    accountCode: l.accountCode,
    partyCode: l.partyCode,
    debit: isPayment ? l.amount : 0,
    credit: isPayment ? 0 : l.amount,
    description: l.description,
  }));

  const treasury: DebitCreditLine = {
    accountCode: input.treasuryAccountCode,
    partyCode: null,
    debit: isPayment ? 0 : total,
    credit: isPayment ? total : 0,
    description: null,
  };

  return isPayment ? [...contraLines, treasury] : [treasury, ...contraLines];
}

export function splitCashBankLines(
  voucherType: string,
  lines: DebitCreditLine[],
): { treasuryAccountCode: string; lines: AmountLine[] } | null {
  const mode = isManualVoucherType(voucherType) ? formModeForType(voucherType) : "journal";
  if (mode === "journal") return null;

  const isPayment = mode === "payment";
  const treasury = lines.find((l) => (isPayment ? l.credit > 0 : l.debit > 0));
  if (!treasury) return null;

  const contra = lines.filter((l) => l.accountCode !== treasury.accountCode);
  return {
    treasuryAccountCode: treasury.accountCode,
    lines: contra.map((l) => ({
      accountCode: l.accountCode,
      partyCode: l.partyCode,
      amount: isPayment ? l.debit : l.credit,
      description: l.description,
    })),
  };
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Infer CASH/BANK flag from the serial point used to create an account. */
export function cashBankFromSerial(serialBase: string | null | undefined): "CASH" | "BANK" | null {
  const code = (serialBase ?? "").trim();
  if (code === "1000" || code.startsWith("100")) return "CASH";
  if (code === "1500" || code.startsWith("150") || code.startsWith("101")) return "BANK";
  return null;
}
