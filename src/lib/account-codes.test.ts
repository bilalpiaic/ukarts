import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ACCOUNT_CODE_BASES,
  NEW_SERIES,
  allocateAccountCode,
  defaultSerialBase,
  nextChildSerial,
  nextSeriesPoint,
  serialOptionsForType,
} from "./account-codes.ts";

const SEEDED = [
  "1000",
  "1100",
  "1200",
  "1300",
  "1400",
  "2000",
  "2100",
  "2200",
  "3000",
  "4000",
  "5000",
  "5100",
  "5200",
  "5300",
  "5400",
];

const SEEDED_ACCOUNTS = [
  { account_code: "1000", account_name: "Cash / Bank", account_type: "ASSET" },
  { account_code: "1100", account_name: "Accounts Receivable", account_type: "ASSET" },
  { account_code: "1200", account_name: "Grey Inventory", account_type: "ASSET" },
  { account_code: "1300", account_name: "Processed Cloth", account_type: "ASSET" },
  { account_code: "1400", account_name: "Finished Goods", account_type: "ASSET" },
  { account_code: "2000", account_name: "Supplier Payable", account_type: "LIABILITY" },
  { account_code: "3000", account_name: "Owner Investment", account_type: "EQUITY" },
  { account_code: "4000", account_name: "Sales Income", account_type: "INCOME" },
  { account_code: "5000", account_name: "Grey Consumption", account_type: "EXPENSE" },
  { account_code: "5400", account_name: "Stitching Cost", account_type: "EXPENSE" },
];

describe("nextChildSerial", () => {
  it("starts from the designated base (1000 → 1001)", () => {
    assert.equal(nextChildSerial(SEEDED, "1000"), "1001");
  });

  it("fills holes under a serial point", () => {
    assert.equal(nextChildSerial([...SEEDED, "1002"], "1000"), "1001");
  });

  it("continues after existing children", () => {
    assert.equal(nextChildSerial([...SEEDED, "1001", "1002"], "1000"), "1003");
  });

  it("serialises from later points (1100 → 1101, 5400 → 5401)", () => {
    assert.equal(nextChildSerial(SEEDED, "1100"), "1101");
    assert.equal(nextChildSerial(SEEDED, "5400"), "5401");
  });

  it("rejects a full hundred-block", () => {
    const full = [...SEEDED];
    for (let n = 1001; n <= 1099; n++) full.push(String(n));
    assert.throws(() => nextChildSerial(full, "1000"), /No free serials left under 1000/);
  });
});

describe("nextSeriesPoint", () => {
  it("opens the next unused xx00 in the type range", () => {
    assert.equal(nextSeriesPoint(SEEDED, "ASSET"), "1500");
    assert.equal(nextSeriesPoint(SEEDED, "LIABILITY"), "2300");
    assert.equal(nextSeriesPoint(SEEDED, "EQUITY"), "3100");
    assert.equal(nextSeriesPoint(SEEDED, "INCOME"), "4100");
    assert.equal(nextSeriesPoint(SEEDED, "EXPENSE"), "5500");
  });

  it("uses the type base when the range is empty", () => {
    assert.equal(nextSeriesPoint([], "ASSET"), "1000");
  });
});

describe("allocateAccountCode", () => {
  it("defaults new accounts to the type base serial point", () => {
    assert.equal(allocateAccountCode(SEEDED, "ASSET", "1000"), "1001");
    assert.equal(allocateAccountCode(SEEDED, "LIABILITY", "2000"), "2001");
    assert.equal(allocateAccountCode(SEEDED, "EQUITY", String(ACCOUNT_CODE_BASES.EQUITY)), "3001");
  });

  it("opens a new series when asked", () => {
    assert.equal(allocateAccountCode(SEEDED, "ASSET", NEW_SERIES), "1500");
    assert.equal(allocateAccountCode(SEEDED, "ASSET", ""), "1500");
    assert.equal(allocateAccountCode(SEEDED, "ASSET", null), "1500");
  });

  it("rejects a serial point outside the type range", () => {
    assert.throws(
      () => allocateAccountCode(SEEDED, "ASSET", "2000"),
      /outside the ASSET series/,
    );
  });
});

describe("serial option helpers", () => {
  it("defaults the serial point to the type base when it exists", () => {
    assert.equal(defaultSerialBase(SEEDED_ACCOUNTS, "ASSET"), "1000");
    assert.equal(defaultSerialBase(SEEDED_ACCOUNTS, "EXPENSE"), "5000");
  });

  it("lists designated points with the next child code", () => {
    const options = serialOptionsForType(SEEDED_ACCOUNTS, "ASSET");
    assert.equal(options[0]?.value, "1000");
    assert.equal(options[0]?.nextCode, "1001");
    assert.equal(options.at(-1)?.value, NEW_SERIES);
    assert.equal(options.at(-1)?.nextCode, "1500");
  });
});
