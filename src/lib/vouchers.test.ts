import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  cashBankForType,
  cashBankFromSerial,
  expandCashBankLines,
  filterAccountsForSide,
  formModeForType,
  formatVoucherNumber,
  isBankAccount,
  isCashAccount,
  isManualVoucherType,
  normalizeManualVoucherType,
  splitCashBankLines,
  voucherTypeForMode,
} from "./vouchers.ts";

const ACCOUNTS = [
  { account_code: "1000", account_name: "Cash in Hand", account_type: "ASSET", cash_bank: "CASH" },
  { account_code: "1500", account_name: "Bank", account_type: "ASSET", cash_bank: "BANK" },
  { account_code: "1100", account_name: "Accounts Receivable", account_type: "ASSET", cash_bank: null },
  { account_code: "2000", account_name: "Supplier Payable", account_type: "LIABILITY", cash_bank: null },
  { account_code: "3000", account_name: "Owner Investment", account_type: "EQUITY", cash_bank: null },
  { account_code: "4000", account_name: "Sales Income", account_type: "INCOME", cash_bank: null },
  { account_code: "5100", account_name: "Processing Cost", account_type: "EXPENSE", cash_bank: null },
];

describe("voucher type catalog", () => {
  it("normalises MANUAL and omitted types to JV", () => {
    assert.equal(normalizeManualVoucherType(undefined), "JV");
    assert.equal(normalizeManualVoucherType("MANUAL"), "JV");
    assert.equal(normalizeManualVoucherType("cr"), "CR");
  });

  it("rejects document-backed types on the manual form", () => {
    assert.throws(() => normalizeManualVoucherType("SL"), /must be one of/);
    assert.throws(() => normalizeManualVoucherType("GREY_PURCHASE"), /must be one of/);
  });

  it("maps form mode ↔ prefix", () => {
    assert.equal(voucherTypeForMode("journal"), "JV");
    assert.equal(voucherTypeForMode("payment", "cash"), "CP");
    assert.equal(voucherTypeForMode("payment", "bank"), "BP");
    assert.equal(voucherTypeForMode("receipt", "cash"), "CR");
    assert.equal(voucherTypeForMode("receipt", "bank"), "BR");
    assert.equal(formModeForType("CP"), "payment");
    assert.equal(formModeForType("BR"), "receipt");
    assert.equal(cashBankForType("BP"), "bank");
    assert.equal(isManualVoucherType("JV"), true);
  });

  it("formats per-type numbers like Easy-Books", () => {
    assert.equal(formatVoucherNumber("CR", 1), "CR-000001");
    assert.equal(formatVoucherNumber("BP", 42), "BP-000042");
  });
});

describe("cash vs bank classification", () => {
  it("uses the cash_bank flag when set", () => {
    assert.equal(isCashAccount(ACCOUNTS[0]), true);
    assert.equal(isBankAccount(ACCOUNTS[0]), false);
    assert.equal(isBankAccount(ACCOUNTS[1]), true);
    assert.equal(isCashAccount(ACCOUNTS[1]), false);
  });

  it("falls back to name / code prefixes", () => {
    assert.equal(isCashAccount({ account_code: "1001", account_name: "Petty Cash", account_type: "ASSET" }), true);
    assert.equal(isBankAccount({ account_code: "1501", account_name: "HBL Current", account_type: "ASSET" }), true);
    assert.equal(isBankAccount({ account_code: "1010", account_name: "Meezan", account_type: "ASSET" }), true);
  });

  it("infers the flag from the serial point", () => {
    assert.equal(cashBankFromSerial("1000"), "CASH");
    assert.equal(cashBankFromSerial("1500"), "BANK");
    assert.equal(cashBankFromSerial("1100"), null);
  });
});

describe("side filters", () => {
  it("restricts CP credit to cash and CR debit to cash", () => {
    assert.deepEqual(
      filterAccountsForSide(ACCOUNTS, "CP", "credit").accounts.map((a) => a.account_code),
      ["1000"],
    );
    assert.deepEqual(
      filterAccountsForSide(ACCOUNTS, "BR", "debit").accounts.map((a) => a.account_code),
      ["1500"],
    );
  });

  it("leaves JV unfiltered", () => {
    assert.equal(filterAccountsForSide(ACCOUNTS, "JV", "debit").accounts.length, ACCOUNTS.length);
  });
});

describe("expand / split cash-bank lines", () => {
  it("builds a balanced CP (debit expense, credit cash)", () => {
    const lines = expandCashBankLines({
      voucherType: "CP",
      treasuryAccountCode: "1000",
      lines: [{ accountCode: "5100", amount: 250, description: "Dyeing bill" }],
    });
    assert.equal(lines.length, 2);
    assert.equal(lines[0].accountCode, "5100");
    assert.equal(lines[0].debit, 250);
    assert.equal(lines[1].accountCode, "1000");
    assert.equal(lines[1].credit, 250);
  });

  it("builds a balanced BR (debit bank, credit income)", () => {
    const lines = expandCashBankLines({
      voucherType: "BR",
      treasuryAccountCode: "1500",
      lines: [
        { accountCode: "4000", amount: 100 },
        { accountCode: "1100", amount: 50, partyCode: "C01" },
      ],
    });
    assert.equal(lines[0].accountCode, "1500");
    assert.equal(lines[0].debit, 150);
    assert.equal(lines[2].credit, 50);
    assert.equal(lines[2].partyCode, "C01");
  });

  it("round-trips splitCashBankLines for a payment", () => {
    const expanded = expandCashBankLines({
      voucherType: "BP",
      treasuryAccountCode: "1500",
      lines: [{ accountCode: "2000", amount: 80, partyCode: "V01" }],
    });
    const split = splitCashBankLines("BP", expanded);
    assert.equal(split?.treasuryAccountCode, "1500");
    assert.equal(split?.lines[0].accountCode, "2000");
    assert.equal(split?.lines[0].amount, 80);
  });
});
