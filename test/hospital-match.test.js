const test = require("node:test");
const assert = require("node:assert/strict");
const { matchHospital, planCsvRows } = require("../hospital-match.js");

const hospitals = [
  { id: "barts", name: "St Bartholomew's (Barts)", city: "London" },
  { id: "stthomas", name: "St Thomas'", city: "London" },
  { id: "glenfield", name: "Glenfield, Leicester", city: "Leicester" }
];

test("hospital names match only after case, punctuation and whitespace are normalised", () => {
  assert.equal(matchHospital(hospitals, "St Thomas'").id, "stthomas");
  assert.equal(matchHospital(hospitals, "st   thomas").id, "stthomas");
  assert.equal(matchHospital(hospitals, "Glenfield, Leicester").id, "glenfield");
  assert.equal(matchHospital(hospitals, "glenfield leicester").id, "glenfield");
});

test("a longer London hospital name never falls through to Barts", () => {
  const plan = planCsvRows(hospitals, [
    { hospital: "St Thomas' Hospital, London", serial: "REVIEWST1001", sku: "TCDS0307-NT", notes: "note, with comma" },
    { hospital: "London", serial: "JUSTLONDON1", sku: "CDS0802-XTW" },
    { hospital: "Glenfield, Leicester", serial: "REVIEWGL1001", sku: "TCDS0307-XTW" }
  ]);
  assert.deepEqual(plan.unmatched.map((row) => row.serial), ["REVIEWST1001", "JUSTLONDON1"]);
  assert.equal(plan.matched.length, 1);
  assert.equal(plan.matched[0].hospitalId, "glenfield");
  assert.equal(plan.unmatched.some((row) => row.hospitalId === "barts"), false);
  assert.equal(matchHospital(hospitals, "St Thomas' Hospital, London"), null);
});
