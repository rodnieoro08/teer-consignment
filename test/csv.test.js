const test = require("node:test");
const assert = require("node:assert/strict");
const { unitsToCsv, csvToUnitRows } = require("../csv.js");

test("CSV round trip keeps commas and quotes in hospital names and notes", () => {
  const units = [{
    hospitalId: "glenfield",
    sku: "CDS0802-XTW",
    serial: "SN21009",
    lot: "12,345",
    expiry: "2027-03-15",
    status: "in-stock",
    notes: 'Said "keep, please"'
  }];
  const csv = unitsToCsv(units, {
    hospital: () => ({ name: "Glenfield, Leicester", city: "Leicester" }),
    catalog: () => ({ size: "XTW" })
  });
  const back = csvToUnitRows(csv);
  assert.equal(back.length, 1);
  assert.equal(back[0].hospital, "Glenfield, Leicester");
  assert.equal(back[0].city, "Leicester");
  assert.equal(back[0].sku, "CDS0802-XTW");
  assert.equal(back[0].size || "XTW", "XTW");
  assert.equal(back[0].serial, "SN21009");
  assert.equal(back[0].lot, "12,345");
  assert.equal(back[0].expiry, "2027-03-15");
  assert.equal(back[0].status, "in-stock");
  assert.equal(back[0].notes, 'Said "keep, please"');
});

test("CSV import does not shift columns when the hospital contains a comma", () => {
  const csv = [
    "hospital,city,sku,size,serial,lot,expiry,status,notes",
    '"Glenfield, Leicester",Leicester,CDS0707-NT,NT,ABC123,LOT1,2027-01-02,in-stock,"note, with comma"'
  ].join("\n");
  const rows = csvToUnitRows(csv);
  assert.equal(rows[0].hospital, "Glenfield, Leicester");
  assert.equal(rows[0].sku, "CDS0707-NT");
  assert.equal(rows[0].serial, "ABC123");
  assert.equal(rows[0].lot, "LOT1");
  assert.equal(rows[0].notes, "note, with comma");
});
