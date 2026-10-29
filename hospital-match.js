function normHospitalName(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/['’`´]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function matchHospital(hospitals, name) {
  const key = normHospitalName(name);
  if (!key) return null;
  return (hospitals || []).find((hospital) => hospital && normHospitalName(hospital.name) === key) || null;
}

function planCsvRows(hospitals, rows) {
  const matched = [];
  const unmatched = [];
  (rows || []).forEach((row, index) => {
    if (!row || !String(row.serial || "").trim()) return;
    const hospital = matchHospital(hospitals, row.hospital);
    const item = Object.assign({ index }, row);
    if (hospital) matched.push(Object.assign({ hospitalId: hospital.id }, item));
    else unmatched.push(item);
  });
  return { matched, unmatched };
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { normHospitalName, matchHospital, planCsvRows };
}
