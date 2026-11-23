const test = require("node:test");
const assert = require("node:assert/strict");
const { parDocId, parAmount, countInStock, reorderDeficits, mergeParLists, daysUntilExpiry, expiryBand, unitMatchesQuery, sortUnits, groupByHospital, lendCandidates, guideGaps, shortageBoard, formatReorderLine } = require("../pars.js");

const catalog = [
  { sku: "CDS0802-XTW", family: "MitraClip G5", size: "XTW", kind: "CDS" },
  { sku: "CDS0707-XTW", family: "MitraClip G4", size: "XTW", kind: "CDS" },
  { sku: "TCDS0307-XTW", family: "TriClip G4", size: "XTW", kind: "CDS" },
  { sku: "TCDS0802-NTW", family: "TriClip G5", size: "NTW", kind: "CDS" },
  { sku: "TSGC0207", family: "TriClip G4", size: "SGC", kind: "SGC" },
  { sku: "TC0802-NT", family: "TriClip G5", size: "NT", kind: "BUNDLE" },
  { sku: "TC0802-XT", family: "TriClip G5", size: "XT", kind: "BUNDLE" },
  { sku: "TC0307-XT", family: "TriClip G4", size: "XT", kind: "BUNDLE" }
];
const catalogOf = (sku) => catalog.find((item) => item.sku === sku) || {};
const hospitals = [{ id: "barts", name: "Barts" }, { id: "papworth", name: "Royal Papworth" }];

test("G4 and G5 of the same size are counted apart, including TriClip", () => {
  const units = [
    { status: "in-stock", hospitalId: "barts", sku: "CDS0802-XTW" },
    { status: "in-stock", hospitalId: "barts", sku: "CDS0707-XTW" },
    { status: "in-stock", hospitalId: "barts", sku: "TCDS0307-XTW" },
    { status: "used", hospitalId: "barts", sku: "TCDS0307-XTW" },
    { status: "in-stock", hospitalId: "papworth", sku: "TCDS0802-NTW" }
  ];
  assert.equal(countInStock(units, "barts", "MitraClip G5", "XTW", catalogOf), 1);
  assert.equal(countInStock(units, "barts", "MitraClip G4", "XTW", catalogOf), 1);
  assert.equal(countInStock(units, "barts", "TriClip G4", "XTW", catalogOf), 1);
  assert.equal(countInStock(units, "barts", "TriClip G5", "NTW", catalogOf), 0);
});

test("par zero is not a reorder, and at-zero is distinct from below par", () => {
  const units = [
    { status: "in-stock", hospitalId: "papworth", sku: "TCDS0307-XTW" },
    { status: "in-stock", hospitalId: "papworth", sku: "TSGC0207" }
  ];
  const pars = [
    { id: parDocId("papworth", "TriClip G4", "XTW"), hospitalId: "papworth", family: "TriClip G4", size: "XTW", par: 2 },
    { id: parDocId("barts", "TriClip G4", "XTW"), hospitalId: "barts", family: "TriClip G4", size: "XTW", par: 1 },
    { id: parDocId("barts", "TriClip G4", "SGC"), hospitalId: "barts", family: "TriClip G4", size: "SGC", par: 0 }
  ];
  assert.equal(parAmount(pars, "barts", "TriClip G4", "SGC"), 0);
  const lines = reorderDeficits(hospitals, units, pars, catalogOf);
  const pap = lines.find((line) => line.hospitalId === "papworth" && line.size === "XTW");
  const barts = lines.find((line) => line.hospitalId === "barts" && line.size === "XTW");
  assert.equal(pap.have, 1);
  assert.equal(pap.short, 1);
  assert.equal(pap.atZero, false);
  assert.equal(barts.have, 0);
  assert.equal(barts.atZero, true);
  assert.equal(lines.some((line) => line.size === "SGC" && line.hospitalId === "barts"), false);
  assert.equal(lines.some((line) => line.size === "SGC" && line.hospitalId === "papworth"), false);
});

test("an empty shared list keeps pars this phone has not uploaded", () => {
  const local = [{ id: "barts__triclip-g4__XTW", hospitalId: "barts", family: "TriClip G4", size: "XTW", par: 1 }];
  const merged = mergeParLists(local, [], { pendingParIds: [], pendingParDeleteIds: [], seenParIds: [] });
  assert.equal(merged.pars.length, 1);
  assert.equal(merged.uploads.length, 0);
});

test("a par removed by the team stays removed, and a pending edit is uploaded", () => {
  const local = [
    { id: "barts__triclip-g4__XTW", hospitalId: "barts", family: "TriClip G4", size: "XTW", par: 1 },
    { id: "papworth__triclip-g4__XTW", hospitalId: "papworth", family: "TriClip G4", size: "XTW", par: 3, updatedAt: "2026-10-27T00:00:00.000Z" }
  ];
  const cloud = [
    { id: "papworth__triclip-g4__XTW", hospitalId: "papworth", family: "TriClip G4", size: "XTW", par: 2 }
  ];
  const merged = mergeParLists(local, cloud, {
    pendingParIds: ["papworth__triclip-g4__XTW"],
    pendingParDeleteIds: [],
    seenParIds: ["barts__triclip-g4__XTW", "papworth__triclip-g4__XTW"]
  });
  assert.equal(merged.pars.length, 1);
  assert.equal(merged.pars[0].par, 3);
  assert.deepEqual(merged.uploads.map((row) => row.id), ["papworth__triclip-g4__XTW"]);
});

const now = new Date("2026-11-23T12:00:00");
const lookup = {
  now,
  catalogOf,
  hospitalOf: (id) => hospitals.find((hospital) => hospital.id === id) || { name: id, city: "" }
};

test("expiry bands split expired, 30-day and 90-day stock", () => {
  assert.equal(daysUntilExpiry("2026-11-22", now), -1);
  assert.equal(daysUntilExpiry("2026-11-23", now), 0);
  assert.equal(daysUntilExpiry("", now), null);
  assert.equal(expiryBand("2026-11-22", now), "expired");
  assert.equal(expiryBand("2026-12-01", now), "hot");
  assert.equal(expiryBand("2027-01-20", now), "soon");
  assert.equal(expiryBand("2027-06-01", now), "ok");
  assert.equal(expiryBand("", now), "none");
});

test("find query matches family, notes and expiry without mixing generations", () => {
  const units = [
    { hospitalId: "barts", sku: "CDS0802-XTW", serial: "A1", lot: "LOT1", notes: "lab fridge", expiry: "2026-11-22", status: "in-stock" },
    { hospitalId: "papworth", sku: "CDS0707-XTW", serial: "B1", lot: "", notes: "", expiry: "2027-06-01", status: "in-stock" },
    { hospitalId: "barts", sku: "TCDS0802-NTW", serial: "C1", lot: "", notes: "", expiry: "2026-12-01", status: "used" }
  ];
  const g5 = units.filter((unit) => unitMatchesQuery(unit, { q: "xtw", family: "MitraClip G5", status: "in-stock" }, lookup));
  assert.deepEqual(g5.map((unit) => unit.serial), ["A1"]);
  const noted = units.filter((unit) => unitMatchesQuery(unit, { q: "fridge" }, lookup));
  assert.deepEqual(noted.map((unit) => unit.serial), ["A1"]);
  const hot = units.filter((unit) => unitMatchesQuery(unit, { expiry: "30", status: "in-stock" }, lookup));
  assert.deepEqual(hot.map((unit) => unit.serial), ["A1"]);
  const expired = units.filter((unit) => unitMatchesQuery(unit, { expiry: "expired" }, lookup));
  assert.deepEqual(expired.map((unit) => unit.serial), ["A1"]);
});

test("soonest expiry is listed first and undated stock stays last", () => {
  const units = [
    { hospitalId: "papworth", serial: "later", expiry: "2027-06-01" },
    { hospitalId: "barts", serial: "none", expiry: "" },
    { hospitalId: "leeds", serial: "sooner", expiry: "2026-12-01" }
  ];
  assert.deepEqual(sortUnits(units, "expiry", lookup).map((unit) => unit.serial), ["sooner", "later", "none"]);
  const groups = groupByHospital(sortUnits(units, "hospital", lookup), lookup.hospitalOf);
  assert.deepEqual(groups.map((group) => group.hospitalId), ["barts", "leeds", "papworth"]);
});

test("lend list prefers stock that can move without breaking the lender's par", () => {
  const units = [
    { status: "in-stock", hospitalId: "barts", sku: "CDS0802-XTW" },
    { status: "in-stock", hospitalId: "papworth", sku: "CDS0802-XTW" },
    { status: "in-stock", hospitalId: "papworth", sku: "CDS0802-XTW" },
    { status: "in-stock", hospitalId: "leeds", sku: "CDS0802-XTW" },
    { status: "used", hospitalId: "leeds", sku: "CDS0802-XTW" }
  ];
  const pars = [
    { hospitalId: "barts", family: "MitraClip G5", size: "XTW", par: 2 },
    { hospitalId: "papworth", family: "MitraClip G5", size: "XTW", par: 1 },
    { hospitalId: "leeds", family: "MitraClip G5", size: "XTW", par: 1 }
  ];
  const lenders = lendCandidates(hospitals.concat([{ id: "leeds", name: "Leeds" }]), units, pars, catalogOf, {
    hospitalId: "barts",
    family: "MitraClip G5",
    size: "XTW"
  });
  assert.deepEqual(lenders.map((lender) => [lender.hospitalId, lender.have, lender.spare]), [
    ["papworth", 2, 1],
    ["leeds", 1, 0]
  ]);
});

test("a loose clip with no guide is a gap, and a bundle does not cover it", () => {
  const units = [
    { status: "in-stock", hospitalId: "barts", sku: "TCDS0802-NTW" },
    { status: "in-stock", hospitalId: "barts", sku: "TC0802-NT" },
    { status: "in-stock", hospitalId: "papworth", sku: "TCDS0307-XTW" },
    { status: "in-stock", hospitalId: "papworth", sku: "TSGC0207" },
    { status: "in-stock", hospitalId: "papworth", sku: "TC0802-XT" },
    { status: "in-stock", hospitalId: "leeds", sku: "TC0307-XT" }
  ];
  const sites = hospitals.concat([{ id: "leeds", name: "Leeds", city: "Leeds" }]);
  const gaps = guideGaps(sites, units, catalogOf);
  assert.deepEqual(gaps.map((gap) => [gap.hospitalId, gap.family, gap.clips]), [
    ["barts", "TriClip G5", 1]
  ]);
  const board = shortageBoard(sites, units, [
    { hospitalId: "barts", family: "TriClip G5", size: "NTW", par: 2 }
  ], catalogOf);
  const line = board.deficits.find((item) => item.hospitalId === "barts" && item.size === "NTW");
  assert.equal(line.have, 1);
  assert.equal(line.short, 1);
  assert.equal(line.lenders.length, 0);
  assert.deepEqual(board.guideGaps[0].bundles.map((site) => site.hospitalId), ["papworth"]);
  assert.equal(board.guideGaps[0].looseGuides.length, 0);
  assert.match(formatReorderLine(line), /Nowhere else in stock/);
  const covered = formatReorderLine({ hospital: "Barts", family: "MitraClip G5", size: "XTW", have: 0, par: 2, short: 2, lenders: [{ hospital: "Papworth", have: 2, par: 1, spare: 1 }] });
  assert.match(covered, /Papworth \(2, 1 spare\)/);
});
