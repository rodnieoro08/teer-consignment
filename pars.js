const MATRIX_FAMILIES = [
  { family: "MitraClip G3", sizes: ["NT", "XT", "SGC"] },
  { family: "MitraClip G4", sizes: ["NT", "NTW", "XT", "XTW", "SGC"] },
  { family: "MitraClip G5", sizes: ["NT", "NTW", "XT", "XTW", "SGC"] },
  { family: "TriClip G4", sizes: ["NT", "NTW", "XT", "XTW", "SGC"] },
  { family: "TriClip G5", sizes: ["NT", "NTW", "XT", "XTW", "SGC"] }
];

function familyKey(family) {
  return String(family || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function parDocId(hospitalId, family, size) {
  return hospitalId + "__" + familyKey(family) + "__" + size;
}

function parAmount(pars, hospitalId, family, size) {
  const id = parDocId(hospitalId, family, size);
  const row = (pars || []).find((item) => item && (item.id === id || (item.hospitalId === hospitalId && item.family === family && item.size === size)));
  const amount = row ? Number(row.par) : 0;
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  return Math.min(99, Math.round(amount));
}

function countInStock(units, hospitalId, family, size, catalogOf) {
  return (units || []).filter((unit) => {
    if (!unit || unit.status !== "in-stock" || unit.hospitalId !== hospitalId) return false;
    const item = catalogOf(unit.sku) || {};
    return item.family === family && item.size === size;
  }).length;
}

function reorderDeficits(hospitals, units, pars, catalogOf) {
  const lines = [];
  (hospitals || []).forEach((hospital) => {
    MATRIX_FAMILIES.forEach((group) => {
      group.sizes.forEach((size) => {
        const par = parAmount(pars, hospital.id, group.family, size);
        if (!par) return;
        const have = countInStock(units, hospital.id, group.family, size, catalogOf);
        if (have >= par) return;
        lines.push({
          hospitalId: hospital.id,
          hospital: hospital.name,
          family: group.family,
          size,
          have,
          par,
          short: par - have,
          atZero: have === 0
        });
      });
    });
  });
  return lines;
}

function demoPars() {
  const rows = [
    ["barts", "MitraClip G5", "XTW", 2],
    ["barts", "MitraClip G5", "NTW", 2],
    ["barts", "TriClip G4", "XTW", 1],
    ["papworth", "TriClip G4", "XTW", 2]
  ];
  return rows.map(([hospitalId, family, size, par]) => ({
    id: parDocId(hospitalId, family, size),
    hospitalId,
    family,
    familyKey: familyKey(family),
    size,
    par
  }));
}

function mergeParLists(localPars, cloudRows, sync) {
  const pending = new Set((sync && sync.pendingParIds) || []);
  const pendingDel = new Set((sync && sync.pendingParDeleteIds) || []);
  const seen = new Set((sync && sync.seenParIds) || []);
  const map = new Map();
  (cloudRows || []).forEach((row) => {
    if (!row || !row.id || pendingDel.has(row.id)) return;
    map.set(row.id, row);
  });
  (localPars || []).forEach((row) => {
    if (!row || !row.id || pendingDel.has(row.id)) return;
    if (pending.has(row.id)) {
      map.set(row.id, row);
      return;
    }
    // Never seen on this phone: keep it so an empty shared list cannot wipe local pars.
    // Seen before and now missing: a teammate removed it.
    if (!map.has(row.id) && !seen.has(row.id)) map.set(row.id, row);
  });
  const pars = Array.from(map.values()).filter((row) => Number(row.par) > 0);
  const uploads = pars.filter((row) => pending.has(row.id));
  const deletes = Array.from(pendingDel).filter((id) => (cloudRows || []).some((row) => row && row.id === id));
  return { pars, uploads, deletes };
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    MATRIX_FAMILIES,
    familyKey,
    parDocId,
    parAmount,
    countInStock,
    reorderDeficits,
    demoPars,
    mergeParLists
  };
}
