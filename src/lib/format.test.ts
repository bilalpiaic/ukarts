import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatDocDate, formatPrintStamp } from "./format.ts";

describe("formatDocDate", () => {
  it("prints an ISO date as dd-mmm-yy", () => {
    assert.equal(formatDocDate("2026-10-08"), "08-Oct-26");
    assert.equal(formatDocDate("2026-01-05"), "05-Jan-26");
    assert.equal(formatDocDate("2026-12-31"), "31-Dec-26");
  });

  it("keeps the calendar day when a time is attached", () => {
    assert.equal(formatDocDate("2026-10-08T00:00:00.000Z"), "08-Oct-26");
  });

  it("leaves a blank or unknown value unchanged", () => {
    assert.equal(formatDocDate(""), "");
    assert.equal(formatDocDate("not-a-date"), "not-a-date");
  });
});

describe("formatPrintStamp", () => {
  it("prints the local date and time at the top of a document", () => {
    assert.equal(formatPrintStamp(new Date(2026, 9, 10, 10, 14)), "10-Oct-26, 10:14 AM");
    assert.equal(formatPrintStamp(new Date(2026, 9, 10, 0, 5)), "10-Oct-26, 12:05 AM");
    assert.equal(formatPrintStamp(new Date(2026, 9, 10, 15, 7)), "10-Oct-26, 3:07 PM");
    assert.equal(formatPrintStamp(new Date(2026, 9, 10, 12, 0)), "10-Oct-26, 12:00 PM");
  });
});
