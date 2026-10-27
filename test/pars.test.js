const test = require("node:test");
const assert = require("node:assert/strict");
const { parDocId, parAmount, countInStock, reorderDeficits, mergeParLists } = require("../pars.js");

const catalog = [
  { sku: "CDS0802-XTW", family: "MitraClip G5", size: "XTW" },
  { sku: "CDS0707-XTW", family: "MitraClip G4", size: "XTW" },
  { sku: "TCDS0307-XTW", family: "TriClip G4", size: "XTW" },
  { sku: "TCDS0802-NTW", family: "TriClip G5", size: "NTW" },
  { sku: "TSGC0207", family: "TriClip G4", size: "SGC" }
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
