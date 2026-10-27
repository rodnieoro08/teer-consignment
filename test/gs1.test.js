const test = require("node:test");
const assert = require("node:assert/strict");
const { GS1_GS, parseBarcode } = require("../gs1.js");

test("FNC1 keeps lot 12345 and serial SN21009 apart", () => {
  const raw = "0105415067045577172501011012345" + GS1_GS + "21SN21009";
  const parsed = parseBarcode(raw);
  assert.equal(parsed.gtin, "05415067045577");
  assert.equal(parsed.expiry, "2025-01-01");
  assert.equal(parsed.lot, "12345");
  assert.equal(parsed.serial, "SN21009");
  assert.notEqual(parsed.lot, "1234521SN");
  assert.notEqual(parsed.serial, "009");
});

test("parenthesised HRI parses the same lot and serial", () => {
  const parsed = parseBarcode("(01)05415067045577(17)250101(10)12345(21)SN21009");
  assert.equal(parsed.gtin, "05415067045577");
  assert.equal(parsed.expiry, "2025-01-01");
  assert.equal(parsed.lot, "12345");
  assert.equal(parsed.serial, "SN21009");
});

test("AI 11, 17, 10 and 91 are read with the separator", () => {
  const raw = "0105415067045577112401011726010110LOT99" + GS1_GS + "91SN21009";
  const parsed = parseBarcode(raw);
  assert.equal(parsed.prodDate, "2024-01-01");
  assert.equal(parsed.expiry, "2026-01-01");
  assert.equal(parsed.lot, "LOT99");
  assert.equal(parsed.serial, "SN21009");
});

test("AI 21 wins over a company AI 91 when both are present", () => {
  const raw = "011234567890123410LOT1" + GS1_GS + "91INT123" + GS1_GS + "21SN21009";
  const parsed = parseBarcode(raw);
  assert.equal(parsed.serial, "SN21009");
  assert.equal(parsed.lot, "LOT1");
});

test("a symbology identifier prefix is ignored", () => {
  const raw = "]C10112345678901234172501011012345" + GS1_GS + "21SN21009";
  const parsed = parseBarcode(raw);
  assert.equal(parsed.gtin, "12345678901234");
  assert.equal(parsed.lot, "12345");
  assert.equal(parsed.serial, "SN21009");
});
