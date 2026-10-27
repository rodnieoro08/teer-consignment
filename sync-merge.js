function normSerial(value) {
  return String(value || "").trim().toLowerCase();
}

function mergeUnitLists(localUnits, cloudRows, sync) {
  const pending = new Set((sync && sync.pendingUnitIds) || []);
  const pendingDel = new Set((sync && sync.pendingDeleteIds) || []);
  const seen = new Set((sync && sync.seenUnitIds) || []);
  const cloudById = new Map();
  const cloudBySerial = new Map();
  (cloudRows || []).forEach((row) => {
    if (!row || !row.id) return;
    cloudById.set(row.id, row);
    const key = normSerial(row.serial);
    if (key && !cloudBySerial.has(key)) cloudBySerial.set(key, row);
  });

  const result = [];
  const consumed = new Set();
  const uploads = [];
  let localOnly = 0;

  (localUnits || []).forEach((local) => {
    if (!local || !local.id || pendingDel.has(local.id)) return;
    const cloud = cloudById.get(local.id) || cloudBySerial.get(normSerial(local.serial));
    if (!cloud) {
      if (!seen.has(local.id) || pending.has(local.id)) {
        result.push(local);
        localOnly += 1;
        if (pending.has(local.id)) uploads.push(local);
      }
      return;
    }
    consumed.add(cloud.id);
    const localNewer = !!(local.updatedAt && cloud.updatedAt && local.updatedAt > cloud.updatedAt);
    const takeLocal = pending.has(local.id) || (seen.has(local.id) && localNewer);
    if (takeLocal) {
      const merged = Object.assign({}, cloud, local, { id: cloud.id });
      result.push(merged);
      uploads.push(merged);
      return;
    }
    result.push(cloud);
  });

  (cloudRows || []).forEach((cloud) => {
    if (!cloud || !cloud.id || pendingDel.has(cloud.id) || consumed.has(cloud.id)) return;
    const key = normSerial(cloud.serial);
    if (key && result.some((unit) => normSerial(unit.serial) === key)) return;
    result.push(cloud);
  });

  const deletes = [];
  pendingDel.forEach((id) => {
    if (cloudById.has(id)) deletes.push(id);
  });

  return { units: result, uploads, deletes, localOnly };
}

function mergeEventLists(localEvents, cloudRows, sync) {
  const pending = new Set((sync && sync.pendingEventIds) || []);
  const map = new Map();
  const cloudIds = new Set();
  (cloudRows || []).forEach((event) => {
    if (!event || !event.id) return;
    cloudIds.add(event.id);
    map.set(event.id, event);
  });
  (localEvents || []).forEach((event) => {
    if (!event || !event.id || map.has(event.id)) return;
    map.set(event.id, event);
  });
  const events = Array.from(map.values()).sort((a, b) => String(b.at || "").localeCompare(String(a.at || ""))).slice(0, 300);
  const uploads = events.filter((event) => pending.has(event.id) && !cloudIds.has(event.id));
  return { events, uploads };
}

function mergeImportedUnits(existing, incoming, newId) {
  const units = (existing || []).map((unit) => Object.assign({}, unit));
  const bySerial = new Map();
  const byId = new Set();
  units.forEach((unit) => {
    byId.add(unit.id);
    const key = normSerial(unit.serial);
    if (key && !bySerial.has(key)) bySerial.set(key, unit);
  });
  (incoming || []).forEach((raw) => {
    if (!raw) return;
    const key = normSerial(raw.serial);
    if (!key) return;
    if (bySerial.has(key)) {
      const prev = bySerial.get(key);
      const keepId = prev.id;
      Object.assign(prev, raw, { id: keepId });
      return;
    }
    const unit = Object.assign({}, raw);
    if (!unit.id || byId.has(unit.id)) unit.id = newId();
    byId.add(unit.id);
    units.push(unit);
    bySerial.set(key, unit);
  });
  return units;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { mergeUnitLists, mergeEventLists, mergeImportedUnits };
}
