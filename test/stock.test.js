const test = require("node:test");
const assert = require("node:assert/strict");
const { formatDate, todayStr, daysAgoStr, stampUsed, clearUsedStamp, stampTransit, clearTransitStamp, transitFrom, usedDate, usageRows, usageText, useFirstIds, checkReport, lastCheckFor, eventsForSerial, statusLabel } = require("../stock.js");
const { countInStock, countExpired, countInbound, lendCandidates, guideGaps, reorderDeficits, parDocId } = require("../pars.js");

const catalog = [
  { sku: "CDS0802-XTW", family: "MitraClip G5", size: "XTW", kind: "CDS" },
  { sku: "CDS0802-NTW", family: "MitraClip G5", size: "NTW", kind: "CDS" },
  { sku: "SGC0802", family: "MitraClip G5", size: "SGC", kind: "SGC" }
];
const catalogOf = (sku) => catalog.find((item) => item.sku === sku) || {};
const now = new Date("2026-11-23T10:00:00");
const unit = (id, hospitalId, sku, expiry, status = "in-stock", extra = {}) => Object.assign({ id, hospitalId, sku, serial: "SN" + id, expiry, status, notes: "" }, extra);

test("an expired unit is not stock, cannot be lent, and leaves the shelf below par", () => {
  const units = [
    unit("1", "barts", "CDS0802-XTW", "2026-10-01"),
    unit("2", "barts", "CDS0802-XTW", "2027-03-01"),
    unit("3", "leeds", "CDS0802-XTW", "2026-11-01")
  ];
  assert.equal(countInStock(units, "barts", "MitraClip G5", "XTW", catalogOf, now), 1);
  assert.equal(countExpired(units, "barts", "MitraClip G5", "XTW", catalogOf, now), 1);
  const hospitals = [{ id: "barts", name: "Barts" }, { id: "leeds", name: "Leeds" }];
  const lenders = lendCandidates(hospitals, units, [], catalogOf, { hospitalId: "barts", family: "MitraClip G5", size: "XTW", now });
  assert.equal(lenders.length, 0);
  const pars = [{ id: parDocId("barts", "MitraClip G5", "XTW"), hospitalId: "barts", family: "MitraClip G5", size: "XTW", par: 2 }];
  const lines = reorderDeficits(hospitals, units, pars, catalogOf, now);
  assert.equal(lines.length, 1);
  assert.equal(lines[0].have, 1);
});

test("a unit that expires today still counts, and an expired guide leaves a guide gap", () => {
  const units = [
    unit("1", "barts", "CDS0802-XTW", "2026-11-23"),
    unit("2", "barts", "SGC0802", "2026-11-22")
  ];
  assert.equal(countInStock(units, "barts", "MitraClip G5", "XTW", catalogOf, now), 1);
  const gaps = guideGaps([{ id: "barts", name: "Barts" }], units, catalogOf, now);
  assert.equal(gaps.length, 1);
  assert.equal(gaps[0].family, "MitraClip G5");
});

test("units in transit are counted as on the way, not as stock", () => {
  const units = [unit("1", "barts", "CDS0802-XTW", "2027-03-01", "in-transit")];
  assert.equal(countInStock(units, "barts", "MitraClip G5", "XTW", catalogOf, now), 0);
  assert.equal(countInbound(units, "barts", "MitraClip G5", "XTW", catalogOf), 1);
});

test("dates read as day month year and today is the local calendar day", () => {
  assert.equal(formatDate("2027-03-05"), "5 Mar 2027");
  assert.equal(formatDate("2026-11-23T09:00:00.000Z"), "23 Nov 2026");
  assert.equal(formatDate(""), "");
  assert.equal(todayStr(new Date(2026, 10, 23, 0, 30)), "2026-11-23");
  assert.equal(daysAgoStr(30, new Date(2026, 10, 23, 12, 0)), "2026-10-24");
  assert.equal(statusLabel("in-transit"), "In transit");
});

test("the used stamp is added once, kept with other notes, and removed on restore", () => {
  const once = stampUsed("Transfer: case support", "2026-11-23");
  assert.equal(once, "Transfer: case support | Used 2026-11-23");
  assert.equal(stampUsed(once, "2026-11-24"), "Transfer: case support | Used 2026-11-24");
  assert.equal(clearUsedStamp(once), "Transfer: case support");
  assert.equal(usedDate({ status: "used", notes: once, updatedAt: "2026-12-01T10:00:00.000Z" }), "2026-11-23");
  assert.equal(usedDate({ status: "used", notes: "", updatedAt: "2026-12-01T10:00:00.000Z" }), "2026-12-01");
});

test("the transit stamp names where a unit came from and clears on arrival", () => {
  const notes = stampTransit("Borrowed", "Royal Papworth");
  assert.equal(transitFrom({ notes }), "Royal Papworth");
  assert.equal(clearTransitStamp(notes), "Borrowed");
  assert.equal(transitFrom({ notes: "Borrowed" }), "");
});

test("the usage report keeps used units inside the period, newest first", () => {
  const units = [
    unit("1", "barts", "CDS0802-XTW", "2027-03-01", "used", { notes: "Used 2026-11-20" }),
    unit("2", "barts", "CDS0802-NTW", "2027-03-01", "used", { notes: "Used 2026-09-01" }),
    unit("3", "leeds", "CDS0802-XTW", "2027-03-01", "used", { notes: "Used 2026-11-22", lot: "L9" }),
    unit("4", "leeds", "CDS0802-XTW", "2027-03-01", "in-stock")
  ];
  const rows = usageRows(units, "2026-10-24");
  assert.deepEqual(rows.map((row) => row.id), ["3", "1"]);
  const text = usageText(rows, { catalogOf, hospitalOf: (id) => ({ name: id === "barts" ? "Barts" : "Leeds" }) }, "TEER usage");
  assert.match(text, /Barts \(1\)/);
  assert.match(text, /22 Nov 2026 · MitraClip G5 XTW · REF CDS0802-XTW · SN SN3 · lot L9/);
});

test("use first marks the earliest date only where a shelf has a choice", () => {
  const units = [
    unit("1", "barts", "CDS0802-XTW", "2027-03-01"),
    unit("2", "barts", "CDS0802-XTW", "2026-12-20"),
    unit("3", "barts", "CDS0802-XTW", "2026-10-01"),
    unit("4", "barts", "CDS0802-NTW", "2026-12-01"),
    unit("5", "leeds", "CDS0802-XTW", "2027-01-01"),
    unit("6", "leeds", "CDS0802-XTW", "2027-01-01")
  ];
  assert.deepEqual(Array.from(useFirstIds(units, catalogOf, now)), ["2"]);
});

test("a stock check reports what is missing and what should not be there", () => {
  const expected = [unit("1", "barts", "CDS0802-XTW", "2027-03-01"), unit("2", "barts", "SGC0802", "2027-03-01")];
  const report = checkReport({ hospitalName: "St Bartholomew's (Barts)", expected, foundIds: ["1"], extras: [{ serial: "ZZ9", note: "not on the list" }], date: "2026-11-23" });
  assert.equal(report.found.length, 1);
  assert.deepEqual(report.missing.map((item) => item.id), ["2"]);
  assert.equal(report.log, "Stock check at St Bartholomew's (Barts): 1 of 2 found. Missing: SN2. Not expected: ZZ9.");
  assert.match(report.text, /Not found \(1\)/);
  const last = lastCheckFor([
    { at: "2026-11-01T09:00:00.000Z", by: "AB", text: "Stock check at St Bartholomew's (Barts): 2 of 2 found." },
    { at: "2026-11-23T09:00:00.000Z", by: "RO", text: report.log },
    { at: "2026-11-24T09:00:00.000Z", by: "RO", text: "Stock check at Leeds: 1 of 1 found." }
  ], "St Bartholomew's (Barts)");
  assert.deepEqual(last, { at: "2026-11-23T09:00:00.000Z", by: "RO", found: 1, total: 2 });
});

test("a long list of missing serials still fits the activity log limit", () => {
  const expected = Array.from({ length: 80 }, (_, i) => unit("LONGSERIAL" + i, "barts", "CDS0802-XTW", "2027-03-01"));
  const report = checkReport({ hospitalName: "Barts", expected, foundIds: [], extras: [] });
  assert.ok(report.log.length <= 470);
});

test("unit history matches the whole serial, not a longer one that contains it", () => {
  const events = [
    { text: "Received G5XTW1000 (XTW) at Barts" },
    { text: "Used G5XTW10001 (XTW) at Barts" },
    { text: "Transferred G5XTW1000 Barts → Leeds" }
  ];
  assert.equal(eventsForSerial(events, "G5XTW1000").length, 2);
  assert.equal(eventsForSerial(events, "G5XTW10001").length, 1);
});
