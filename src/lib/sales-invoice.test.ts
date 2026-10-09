import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  SALES_ACCOUNTS,
  buildDispatchSalesJournal,
  buildManualSalesJournal,
  customerClosingBalance,
  receivableOnInvoice,
} from "./sales-invoice.ts";

describe("buildManualSalesJournal", () => {
  it("debits Accounts Receivable and credits Sales Income on a credit bill", () => {
    const journal = buildManualSalesJournal({
      gross: 7400,
      discount: 0,
      tax: 0,
      paymentType: "CREDIT",
    });
    assert.equal(journal.net, 7400);
    assert.deepEqual(
      journal.lines.map((l) => [l.accountCode, l.debit, l.credit, l.withCustomer]),
      [[SALES_ACCOUNTS.receivable, 7400, 0, true], [SALES_ACCOUNTS.sales, 0, 7400, false]],
    );
  });

  it("debits Cash in Hand or Bank when the bill is settled that way", () => {
    const cash = buildManualSalesJournal({ gross: 500, discount: 0, tax: 0, paymentType: "CASH" });
    const bank = buildManualSalesJournal({ gross: 500, discount: 0, tax: 0, paymentType: "bank" });
    assert.equal(cash.lines[0]?.accountCode, SALES_ACCOUNTS.cash);
    assert.equal(cash.lines[0]?.withCustomer, false);
    assert.equal(bank.lines[0]?.accountCode, SALES_ACCOUNTS.bank);
  });

  it("splits discount and sales tax onto their own accounts and still balances", () => {
    const journal = buildManualSalesJournal({
      gross: 10000,
      discount: 500,
      tax: 180,
      paymentType: "CREDIT",
    });
    assert.equal(journal.net, 9680);
    const debit = journal.lines.reduce((s, l) => s + l.debit, 0);
    const credit = journal.lines.reduce((s, l) => s + l.credit, 0);
    assert.equal(debit, credit);
    assert.equal(debit, 10180);
    const byAccount = Object.fromEntries(journal.lines.map((l) => [l.accountCode, l]));
    assert.equal(byAccount[SALES_ACCOUNTS.receivable]?.debit, 9680);
    assert.equal(byAccount[SALES_ACCOUNTS.discount]?.debit, 500);
    assert.equal(byAccount[SALES_ACCOUNTS.sales]?.credit, 10000);
    assert.equal(byAccount[SALES_ACCOUNTS.tax]?.credit, 180);
  });

  it("omits the settlement line when the discount clears the bill", () => {
    const journal = buildManualSalesJournal({
      gross: 200,
      discount: 200,
      tax: 0,
      paymentType: "CREDIT",
    });
    assert.equal(journal.net, 0);
    assert.deepEqual(
      journal.lines.map((l) => l.accountCode),
      [SALES_ACCOUNTS.discount, SALES_ACCOUNTS.sales],
    );
  });

  it("adds a credit bill to the customer's previous balance", () => {
    assert.equal(receivableOnInvoice("CREDIT", 562500), 562500);
    assert.equal(receivableOnInvoice("CASH", 1800), 0);
    assert.deepEqual(customerClosingBalance(100000, 562500), {
      previous: 100000,
      invoice: 562500,
      closing: 662500,
    });
  });

  it("builds a balanced cash or credit dispatch voucher", () => {
    const credit = buildDispatchSalesJournal({ amount: 1850, paymentType: "CREDIT" });
    assert.equal(credit.amount, 1850);
    assert.deepEqual(
      credit.lines.map((l) => [l.accountCode, l.debit, l.credit, l.withCustomer]),
      [[SALES_ACCOUNTS.receivable, 1850, 0, true], [SALES_ACCOUNTS.sales, 0, 1850, false]],
    );
    const cash = buildDispatchSalesJournal({ amount: 400.125, paymentType: "cash" });
    assert.equal(cash.amount, 400.13);
    assert.equal(cash.lines[0]?.accountCode, SALES_ACCOUNTS.cash);
    assert.equal(cash.lines[0]?.withCustomer, false);
    assert.throws(
      () => buildDispatchSalesJournal({ amount: 0, paymentType: "CREDIT" }),
      /greater than zero/,
    );
  });

  it("rejects a discount above the goods total", () => {
    assert.throws(
      () => buildManualSalesJournal({ gross: 100, discount: 150, tax: 0, paymentType: "CASH" }),
      /Discount cannot exceed/,
    );
  });
});
