const BACKUP_SETTINGS = ["specialist", "team", "lastHospital", "lastSku"];

function phoneBackup(state) {
  const settings = state && state.settings ? state.settings : {};
  const kept = {};
  BACKUP_SETTINGS.forEach((key) => {
    kept[key] = typeof settings[key] === "string" ? settings[key] : "";
  });
  return {
    exportedAt: new Date().toISOString(),
    specialist: kept.specialist,
    units: (state && state.units) || [],
    events: (state && state.events) || [],
    hospitalsExtra: ((state && state.hospitals) || []).filter((hospital) => hospital && hospital.custom),
    pars: (state && state.pars) || [],
    settings: kept
  };
}

function usablePar(row) {
  return !!(row && row.id && row.hospitalId && row.family && row.size && Number(row.par) > 0);
}

function applyPhoneBackup(current, data) {
  const settings = Object.assign({}, (current && current.settings) || {});
  let pars = (current && current.pars) ? current.pars.slice() : [];
  if (data && Array.isArray(data.pars)) {
    pars = data.pars.filter(usablePar).map((row) => Object.assign({}, row, { par: Math.min(99, Math.round(Number(row.par))) }));
  }
  if (data && data.settings && typeof data.settings === "object") {
    BACKUP_SETTINGS.forEach((key) => {
      if (typeof data.settings[key] === "string") settings[key] = data.settings[key];
    });
  } else if (data && typeof data.specialist === "string") {
    settings.specialist = data.specialist;
  }
  return { pars, settings };
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { BACKUP_SETTINGS, phoneBackup, applyPhoneBackup };
}
