const test = require("node:test");
const assert = require("node:assert/strict");
const { mergeUnitLists, mergeImportedUnits } = require("../sync-merge.js");

test("an empty shared list does not drop local units", () => {
  const local = [{ id: "local-1", serial: "SN1", sku: "CDS0802-XTW", updatedAt: "2026-01-01T00:00:00.000Z" }];
  const merged = mergeUnitLists(local, [], { pendingUnitIds: [], pendingDeleteIds: [], seenUnitIds: [] });
  assert.equal(merged.units.length, 1);
  assert.equal(merged.units[0].id, "local-1");
  assert.equal(merged.uploads.length, 0);
  assert.equal(merged.localOnly, 1);
});

test("pending offline edits are kept and queued to upload onto the cloud id", () => {
  const local = [{ id: "local-1", serial: "SN1", notes: "edited offline", updatedAt: "2026-02-02T00:00:00.000Z" }];
  const cloud = [{ id: "cloud-9", serial: "SN1", notes: "old", updatedAt: "2026-01-01T00:00:00.000Z" }];
  const merged = mergeUnitLists(local, cloud, {
    pendingUnitIds: ["local-1"],
    pendingDeleteIds: [],
    seenUnitIds: []
  });
  assert.equal(merged.units.length, 1);
  assert.equal(merged.units[0].id, "cloud-9");
  assert.equal(merged.units[0].notes, "edited offline");
  assert.equal(merged.uploads[0].id, "cloud-9");
});

test("a previously seen unit missing from the cloud is treated as a remote delete", () => {
  const local = [{ id: "gone", serial: "SN9", updatedAt: "2026-01-01T00:00:00.000Z" }];
  const merged = mergeUnitLists(local, [], {
    pendingUnitIds: [],
    pendingDeleteIds: [],
    seenUnitIds: ["gone"]
  });
  assert.equal(merged.units.length, 0);
});

test("JSON import over an existing serial keeps the existing id", () => {
  const existing = [{ id: "keep-me", serial: "SN21009", sku: "CDS0802-NT", notes: "phone" }];
  const incoming = [{ id: "from-file", serial: "SN21009", sku: "CDS0802-XTW", notes: "file" }];
  const units = mergeImportedUnits(existing, incoming, () => "new-id");
  assert.equal(units.length, 1);
  assert.equal(units[0].id, "keep-me");
  assert.equal(units[0].sku, "CDS0802-XTW");
  assert.equal(units[0].notes, "file");
});

test("JSON import gives a fresh id when the file id is already used by another serial", () => {
  const existing = [{ id: "taken", serial: "OTHER", sku: "SGC0802" }];
  const incoming = [{ id: "taken", serial: "SN21009", sku: "CDS0802-NT" }];
  const units = mergeImportedUnits(existing, incoming, () => "fresh");
  assert.equal(units.length, 2);
  assert.equal(units[1].id, "fresh");
  assert.equal(units[1].serial, "SN21009");
});
