const test = require("node:test");
const assert = require("node:assert/strict");
const { phoneBackup, applyPhoneBackup } = require("../backup.js");

test("a phone backup includes par levels and the settings needed to move phones", () => {
  const backup = phoneBackup({
    units: [{ id: "u1", serial: "ABC123" }],
    events: [],
    hospitals: [{ id: "barts", name: "Barts" }, { id: "extra", name: "Extra", custom: true }],
    pars: [{ id: "barts__triclip-g4__XTW", hospitalId: "barts", family: "TriClip G4", size: "XTW", par: 2 }],
    settings: { specialist: "RO", team: "UK TEER", lastHospital: "barts", lastSku: "TCDS0307-XTW", cloudUrl: "secret" }
  });
  assert.equal(backup.pars.length, 1);
  assert.equal(backup.settings.specialist, "RO");
  assert.equal(backup.settings.lastSku, "TCDS0307-XTW");
  assert.equal(backup.hospitalsExtra.length, 1);
  assert.equal(Object.prototype.hasOwnProperty.call(backup.settings, "cloudUrl"), false);
});

test("an older backup without par levels leaves the phone's pars in place", () => {
  const current = {
    pars: [{ id: "keep", hospitalId: "barts", family: "TriClip G4", size: "XTW", par: 1 }],
    settings: { specialist: "RO", team: "UK TEER", lastHospital: "barts", lastSku: "CDS0802-XTW" }
  };
  const applied = applyPhoneBackup(current, {
    specialist: "AM",
    units: [{ serial: "OLD1" }]
  });
  assert.equal(applied.pars[0].id, "keep");
  assert.equal(applied.settings.specialist, "AM");
  assert.equal(applied.settings.lastHospital, "barts");
});

test("a backup that includes pars replaces them", () => {
  const applied = applyPhoneBackup(
    { pars: [{ id: "old", hospitalId: "barts", family: "MitraClip G5", size: "NT", par: 1 }], settings: { specialist: "RO" } },
    { pars: [{ id: "new", hospitalId: "papworth", family: "TriClip G5", size: "NT", par: 2 }], settings: { specialist: "AM", lastHospital: "papworth", ignored: "no" } }
  );
  assert.deepEqual(applied.pars.map((row) => row.id), ["new"]);
  assert.equal(applied.settings.specialist, "AM");
  assert.equal(applied.settings.lastHospital, "papworth");
  assert.equal(applied.settings.ignored, undefined);
});
