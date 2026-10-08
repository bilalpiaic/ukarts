/**
 * Accounting treatment for a manual sales invoice.
 *
 * The bill is not a stock dispatch. It recognises revenue and settles it
 * through the account that matches how the customer pays:
 *
 *   Dr  Cash in Hand / Bank / Accounts Receivable   net receivable
 *   Dr  Discount Allowed                            trade discount, when given
 *       Cr  Sales Income                            goods value (gross)
 *       Cr  Sales Tax Payable                       output tax, when charged
 *
 * Debits equal credits: (net + discount) = (gross + tax), and
 * net = gross − discount + tax.
 */

export const SALES_ACCOUNTS = {
  cash: "1000",
  receivable: "1100",
  bank: "1500",
  tax: "2300",
  sales: "4000",
  discount: "5500",
} as const;

export type SalesPaymentType = "CASH" | "CREDIT" | "BANK";

export interface ManualSalesJournalLine {
  accountCode: string;
  debit: number;
  credit: number;
  /** True only for the customer sub-ledger on Accounts Receivable. */
  withCustomer: boolean;
  role: "settlement" | "discount" | "sales" | "tax";
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Amount this bill debits on the customer's Accounts Receivable sub-ledger. */
export function receivableOnInvoice(paymentType: string, net: number): number {
  return paymentType.trim().toUpperCase() === "CREDIT" ? round2(net) : 0;
}

/** Previous posted balance plus this bill's receivable is the closing balance. */
export function customerClosingBalance(previous: number, thisReceivable: number): {
  previous: number;
  invoice: number;
  closing: number;
} {
  const prev = round2(previous);
  const bill = round2(thisReceivable);
  return { previous: prev, invoice: bill, closing: round2(prev + bill) };
}

export function salesPaymentLabel(paymentType: string): string {
  if (paymentType === "CASH") return "Cash — Cash in Hand";
  if (paymentType === "BANK") return "Bank";
  if (paymentType === "CREDIT") return "Credit — Accounts Receivable";
  return paymentType;
}

/** System-locked dispatch: Dr Cash or Accounts Receivable, Cr Sales Income. */
export function buildDispatchSalesJournal(input: {
  amount: number;
  paymentType: string;
}): { amount: number; lines: ManualSalesJournalLine[] } {
  const payment = input.paymentType.trim().toUpperCase();
  if (payment !== "CASH" && payment !== "CREDIT") {
    throw new Error("Payment must be Cash or Credit.");
  }
  if (!Number.isFinite(input.amount)) throw new Error("Amount must be a number.");
  const amount = round2(input.amount);
  if (!(amount > 0)) throw new Error("Invoice total must be greater than zero.");
  return {
    amount,
    lines: [
      {
        accountCode: payment === "CASH" ? SALES_ACCOUNTS.cash : SALES_ACCOUNTS.receivable,
        debit: amount,
        credit: 0,
        withCustomer: payment === "CREDIT",
        role: "settlement",
      },
      {
        accountCode: SALES_ACCOUNTS.sales,
        debit: 0,
        credit: amount,
        withCustomer: false,
        role: "sales",
      },
    ],
  };
}

export function buildManualSalesJournal(input: {
  gross: number;
  discount: number;
  tax: number;
  paymentType: string;
}): { net: number; lines: ManualSalesJournalLine[] } {
  const payment = input.paymentType.trim().toUpperCase();
  if (payment !== "CASH" && payment !== "CREDIT" && payment !== "BANK") {
    throw new Error("Payment must be Cash, Bank, or Credit.");
  }
  if (![input.gross, input.discount, input.tax].every((n) => Number.isFinite(n))) {
    throw new Error("Amounts must be numbers.");
  }
  const gross = round2(input.gross);
  const discount = round2(input.discount);
  const tax = round2(input.tax);
  if (!(gross > 0)) throw new Error("Invoice total must be greater than zero.");
  if (discount < 0) throw new Error("Discount cannot be negative.");
  if (tax < 0) throw new Error("Sales tax cannot be negative.");
  if (discount - gross > 0.001) throw new Error("Discount cannot exceed the goods total.");

  const net = round2(gross - discount + tax);
  if (net < -0.001) throw new Error("Net receivable cannot be negative.");

  const lines: ManualSalesJournalLine[] = [];
  if (net > 0) {
    const settlement =
      payment === "CASH"
        ? SALES_ACCOUNTS.cash
        : payment === "BANK"
          ? SALES_ACCOUNTS.bank
          : SALES_ACCOUNTS.receivable;
    lines.push({
      accountCode: settlement,
      debit: net,
      credit: 0,
      withCustomer: payment === "CREDIT",
      role: "settlement",
    });
  }
  if (discount > 0) {
    lines.push({
      accountCode: SALES_ACCOUNTS.discount,
      debit: discount,
      credit: 0,
      withCustomer: false,
      role: "discount",
    });
  }
  lines.push({
    accountCode: SALES_ACCOUNTS.sales,
    debit: 0,
    credit: gross,
    withCustomer: false,
    role: "sales",
  });
  if (tax > 0) {
    lines.push({
      accountCode: SALES_ACCOUNTS.tax,
      debit: 0,
      credit: tax,
      withCustomer: false,
      role: "tax",
    });
  }

  const debit = round2(lines.reduce((s, l) => s + l.debit, 0));
  const credit = round2(lines.reduce((s, l) => s + l.credit, 0));
  if (debit !== credit) {
    throw new Error("Sales invoice journal does not balance.");
  }
  return { net, lines };
}
