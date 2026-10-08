import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MONEY_PICTURE, groupAmountInput, money, sanitizeAmountInput } from "./format.ts";

describe("money", () => {
  it("groups millions and thousands and always shows two decimals", () => {
    assert.equal(money(0), "0.00");
    assert.equal(money(750), "750.00");
    assert.equal(money(1234567.5), "1,234,567.50");
    assert.equal(money("100000000"), "100,000,000.00");
    assert.equal(money(123456789.01), "123,456,789.01");
    assert.equal(money(-42.1), "-42.10");
    assert.equal(money("not-a-number"), "0.00");
  });
});

describe("amount entry", () => {
  it("keeps typed amounts inside the 000,000,000.00 picture", () => {
    assert.equal(sanitizeAmountInput("12,34a5.678"), "12345.67");
    assert.equal(sanitizeAmountInput("000123"), "123");
    assert.equal(sanitizeAmountInput("."), "0.");
    assert.equal(sanitizeAmountInput("1234567890123.99"), "123456789.99");
    assert.equal(groupAmountInput("123456789.00"), "123,456,789.00");
    assert.equal(groupAmountInput("123456789.00").length, MONEY_PICTURE.length);
    assert.equal(groupAmountInput(""), "");
  });
});
