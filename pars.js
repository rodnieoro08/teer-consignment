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

function daysUntilExpiry(expiry, now) {
  if (!expiry || !/^\d{4}-\d{2}-\d{2}$/.test(expiry)) return null;
  const end = new Date(expiry + "T00:00:00");
  const start = now instanceof Date ? now : new Date(now || Date.now());
  if (Number.isNaN(end.getTime()) || Number.isNaN(start.getTime())) return null;
  const days = Math.ceil((end - start) / 86400000);
  return days === 0 ? 0 : days;
}

function expiryBand(expiry, now) {
  const days = daysUntilExpiry(expiry, now);
  if (days == null) return "none";
  if (days < 0) return "expired";
  if (days <= 30) return "hot";
  if (days <= 90) return "soon";
  return "ok";
}

function unitMatchesQuery(unit, query, deps) {
  if (!unit) return false;
  const spec = query || {};
  const lookup = deps || {};
  const catalogOf = lookup.catalogOf || (() => ({}));
  const hospitalOf = lookup.hospitalOf || (() => ({}));
  if (spec.status && unit.status !== spec.status) return false;
  const item = catalogOf(unit.sku) || {};
  if (spec.size && item.size !== spec.size) return false;
  if (spec.family && item.family !== spec.family) return false;
  if (spec.expiry === "expired" || spec.expiry === "30" || spec.expiry === "90") {
    const days = daysUntilExpiry(unit.expiry, lookup.now);
    if (days == null) return false;
    if (spec.expiry === "expired" && days >= 0) return false;
    if (spec.expiry === "30" && days > 30) return false;
    if (spec.expiry === "90" && days > 90) return false;
  }
  const q = String(spec.q || "").trim().toLowerCase();
  if (!q) return true;
  const hospital = hospitalOf(unit.hospitalId) || {};
  const hay = [unit.serial, unit.sku, unit.lot, unit.notes, item.label, item.family, item.size, item.kind, hospital.name, hospital.city, hospital.region].join(" ").toLowerCase();
  return hay.includes(q);
}

function sortUnits(units, sort, deps) {
  const lookup = deps || {};
  const hospitalOf = lookup.hospitalOf || (() => ({}));
  const copy = (units || []).slice();
  const nameOf = (unit) => (hospitalOf(unit.hospitalId) || {}).name || "";
  copy.sort((a, b) => {
    if (sort === "expiry") {
      const da = daysUntilExpiry(a.expiry, lookup.now);
      const db = daysUntilExpiry(b.expiry, lookup.now);
      const aa = da == null ? 99999 : da;
      const bb = db == null ? 99999 : db;
      if (aa !== bb) return aa - bb;
    } else if (sort === "serial") {
      return String(a.serial || "").localeCompare(String(b.serial || ""));
    }
    const byHospital = nameOf(a).localeCompare(nameOf(b));
    if (byHospital) return byHospital;
    return String(a.serial || "").localeCompare(String(b.serial || ""));
  });
  return copy;
}

function groupByHospital(units, hospitalOf) {
  const lookup = hospitalOf || (() => ({}));
  const groups = [];
  const index = new Map();
  (units || []).forEach((unit) => {
    const id = unit.hospitalId;
    if (!index.has(id)) {
      const hospital = lookup(id) || {};
      const group = { hospitalId: id, name: hospital.name || id || "", city: hospital.city || "", units: [] };
      index.set(id, group);
      groups.push(group);
    }
    index.get(id).units.push(unit);
  });
  return groups;
}

function countKindInStock(units, hospitalId, family, kind, catalogOf) {
  return (units || []).filter((unit) => {
    if (!unit || unit.status !== "in-stock" || unit.hospitalId !== hospitalId) return false;
    const item = catalogOf(unit.sku) || {};
    return item.family === family && item.kind === kind;
  }).length;
}

function holdersOf(hospitals, units, catalogOf, spec) {
  const need = spec || {};
  const kinds = need.kinds || [];
  const out = [];
  (hospitals || []).forEach((hospital) => {
    if (!hospital || hospital.id === need.exceptHospitalId) return;
    const have = (units || []).filter((unit) => {
      if (!unit || unit.status !== "in-stock" || unit.hospitalId !== hospital.id) return false;
      const item = catalogOf(unit.sku) || {};
      if (need.family && item.family !== need.family) return false;
      if (need.size && item.size !== need.size) return false;
      if (kinds.length && kinds.indexOf(item.kind) === -1) return false;
      return true;
    }).length;
    if (!have) return;
    out.push({ hospitalId: hospital.id, hospital: hospital.name, city: hospital.city || "", have });
  });
  out.sort((a, b) => b.have - a.have || String(a.hospital).localeCompare(String(b.hospital)));
  return out;
}

function lendCandidates(hospitals, units, pars, catalogOf, need) {
  const spec = need || {};
  const out = [];
  (hospitals || []).forEach((hospital) => {
    if (!hospital || hospital.id === spec.hospitalId) return;
    const have = countInStock(units, hospital.id, spec.family, spec.size, catalogOf);
    if (!have) return;
    const par = parAmount(pars, hospital.id, spec.family, spec.size);
    out.push({
      hospitalId: hospital.id,
      hospital: hospital.name,
      city: hospital.city || "",
      have,
      par,
      spare: Math.max(0, have - par)
    });
  });
  out.sort((a, b) => b.spare - a.spare || b.have - a.have || String(a.hospital).localeCompare(String(b.hospital)));
  return out;
}

function guideGaps(hospitals, units, catalogOf) {
  const lines = [];
  (hospitals || []).forEach((hospital) => {
    MATRIX_FAMILIES.forEach((group) => {
      const clips = countKindInStock(units, hospital.id, group.family, "CDS", catalogOf);
      const guides = countKindInStock(units, hospital.id, group.family, "SGC", catalogOf);
      if (clips > 0 && guides === 0) {
        lines.push({
          hospitalId: hospital.id,
          hospital: hospital.name,
          city: hospital.city || "",
          family: group.family,
          clips
        });
      }
    });
  });
  return lines;
}

function formatLenders(lenders) {
  return (lenders || []).slice(0, 3).map((lender) => {
    if (!lender.par) return lender.hospital + " (" + lender.have + ")";
    if (lender.spare > 0) return lender.hospital + " (" + lender.have + ", " + lender.spare + " spare)";
    return lender.hospital + " (" + lender.have + ", at their par)";
  }).join("; ");
}

function formatReorderLine(line) {
  const base = line.hospital + ": " + line.family + " " + line.size + " has " + line.have + ", par " + line.par + ", short " + line.short;
  const where = formatLenders(line.lenders);
  return where ? base + ". Also at " + where : base + ". Nowhere else in stock";
}

function shortageBoard(hospitals, units, pars, catalogOf) {
  const deficits = reorderDeficits(hospitals, units, pars, catalogOf).map((line) => {
    const lenders = lendCandidates(hospitals, units, pars, catalogOf, line);
    return Object.assign({}, line, { lenders });
  });
  const gaps = guideGaps(hospitals, units, catalogOf).map((gap) => {
    return Object.assign({}, gap, {
      looseGuides: holdersOf(hospitals, units, catalogOf, { family: gap.family, kinds: ["SGC"], exceptHospitalId: gap.hospitalId }),
      bundles: holdersOf(hospitals, units, catalogOf, { family: gap.family, kinds: ["BUNDLE"], exceptHospitalId: gap.hospitalId })
    });
  });
  return { deficits, guideGaps: gaps };
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
    mergeParLists,
    daysUntilExpiry,
    expiryBand,
    unitMatchesQuery,
    sortUnits,
    groupByHospital,
    countKindInStock,
    holdersOf,
    lendCandidates,
    guideGaps,
    formatLenders,
    formatReorderLine,
    shortageBoard
  };
}
