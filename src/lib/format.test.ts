import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatDocDate } from "./format.ts";

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
