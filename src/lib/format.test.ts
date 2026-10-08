import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatDate, parseDate } from "./format.ts";

describe("formatDate", () => {
  it("prints dd-mmm-yy", () => {
    assert.equal(formatDate("2026-10-08"), "08-Oct-26");
    assert.equal(formatDate("2026-01-01"), "01-Jan-26");
    assert.equal(formatDate("1999-12-31"), "31-Dec-99");
    assert.equal(formatDate("2026-10-08 00:00:00+00"), "08-Oct-26");
    assert.equal(formatDate(""), "");
    assert.equal(formatDate(null), "");
  });
});

describe("parseDate", () => {
  it("reads the system picture and keeps a real calendar date", () => {
    assert.equal(parseDate("08-Oct-26"), "2026-10-08");
    assert.equal(parseDate("8-oct-26"), "2026-10-08");
    assert.equal(parseDate("08-Oct-2026"), "2026-10-08");
    assert.equal(parseDate("08-10-26"), "2026-10-08");
    assert.equal(parseDate("2026-10-08"), "2026-10-08");
    assert.equal(parseDate("32-Oct-26"), null);
    assert.equal(parseDate("08-Xxx-26"), null);
    assert.equal(parseDate("31-Feb-26"), null);
  });
});
