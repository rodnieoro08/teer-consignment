const KEY = "teer-consign-v1";
const SIZES = ["NT", "NTW", "XT", "XTW", "SGC"];
const state = {
  hospitals: HOSPITALS,
  catalog: CATALOG,
  units: [],
  pars: [],
  events: [],
  settings: { specialist: "", team: "UK TEER", cloudUrl: "", lastHospital: "barts" }
};
function emptySync() {
  return { pendingUnitIds: [], pendingDeleteIds: [], pendingDeleteSerials: {}, seenUnitIds: [], pendingEventIds: [], pendingParIds: [], pendingParDeleteIds: [], seenParIds: [] };
}
function load() {
  state.sync = emptySync();
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) {
      state.units = demoUnits();
      state.pars = demoPars();
      state.events = [{ id: crypto.randomUUID(), at: new Date().toISOString(), text: "Demo consignment loaded. Replace with your real serials." }];
      save();
      return;
    }
    const d = JSON.parse(raw);
    state.units = d.units || [];
    state.pars = d.pars || [];
    state.events = d.events || [];
    state.settings = Object.assign(state.settings, d.settings || {});
    state.sync = Object.assign(emptySync(), d.sync || {});
    if (d.hospitalsExtra) {
      d.hospitalsExtra.forEach(h => {
        if (!state.hospitals.find(x => x.id === h.id)) state.hospitals.push(h);
      });
    }
  } catch (e) {
    state.units = demoUnits();
    state.pars = demoPars();
  }
  let stamped = false;
  state.events.forEach(e => {
    if (e && !e.id) { e.id = crypto.randomUUID(); stamped = true; }
  });
  if (stamped) save();
}
function save() {
  if (typeof saveLocalOnly === "function") saveLocalOnly();
  else localStorage.setItem(KEY, JSON.stringify({ units: state.units, events: state.events.slice(0, 300), settings: state.settings, hospitalsExtra: state.hospitals.filter(h => h.custom) }));
}
function markPendingUnit(id) {
  if (!id || !state.sync) return;
  if (!state.sync.pendingUnitIds.includes(id)) state.sync.pendingUnitIds.push(id);
}
function clearPendingUnit(id) {
  if (!state.sync) return;
  state.sync.pendingUnitIds = state.sync.pendingUnitIds.filter(item => item !== id);
}
function markPendingDelete(id, serial) {
  if (!id || !state.sync) return;
  clearPendingUnit(id);
  if (!state.sync.pendingDeleteSerials || Array.isArray(state.sync.pendingDeleteSerials)) state.sync.pendingDeleteSerials = {};
  if (!state.sync.pendingDeleteIds.includes(id)) state.sync.pendingDeleteIds.push(id);
  state.sync.pendingDeleteSerials[id] = String(serial || "");
}
function clearPendingDelete(id) {
  if (!state.sync) return;
  state.sync.pendingDeleteIds = state.sync.pendingDeleteIds.filter(item => item !== id);
  if (state.sync.pendingDeleteSerials) delete state.sync.pendingDeleteSerials[id];
}
function serialClash(serial, exceptId) {
  const key = normSerial(serial);
  if (!key) return null;
  return state.units.find(unit => unit.id !== exceptId && normSerial(unit.serial) === key) || null;
}
function markPendingEvent(id) {
  if (!id || !state.sync) return;
  if (!state.sync.pendingEventIds.includes(id)) state.sync.pendingEventIds.push(id);
}
function clearPendingEvent(id) {
  if (!state.sync) return;
  state.sync.pendingEventIds = state.sync.pendingEventIds.filter(item => item !== id);
}
function markPendingPar(id) {
  if (!id || !state.sync) return;
  state.sync.pendingParDeleteIds = state.sync.pendingParDeleteIds.filter(item => item !== id);
  if (!state.sync.pendingParIds.includes(id)) state.sync.pendingParIds.push(id);
}
function clearPendingPar(id) {
  if (!state.sync) return;
  state.sync.pendingParIds = state.sync.pendingParIds.filter(item => item !== id);
}
function markPendingParDelete(id) {
  if (!id || !state.sync) return;
  clearPendingPar(id);
  if (!state.sync.pendingParDeleteIds.includes(id)) state.sync.pendingParDeleteIds.push(id);
}
function clearPendingParDelete(id) {
  if (!state.sync) return;
  state.sync.pendingParDeleteIds = state.sync.pendingParDeleteIds.filter(item => item !== id);
}
async function saveUnitCloud(u) {
  if (!(cloud && cloud.live)) markPendingUnit(u.id);
  save();
  if (typeof cloudUpsert === "function") {
    try {
      await cloudUpsert("units", u.id, u);
      if (cloud && cloud.live) clearPendingUnit(u.id);
    } catch (e) {
      markPendingUnit(u.id);
      save();
      toast(e.message);
    }
  }
}
function toast(msg) {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.style.display = "block";
  setTimeout(() => { el.style.display = "none"; }, 2200);
}
function catalogOf(sku) { return state.catalog.find(c => c.sku === sku) || { sku, size: "?", kind: "?", label: sku, family: "" }; }
function hospitalOf(id) { return state.hospitals.find(h => h.id === id) || { name: id, city: "", region: "" }; }
function inStock(u) { return u.status === "in-stock"; }
function daysTo(exp) {
  if (!exp) return 9999;
  return Math.ceil((new Date(exp + "T00:00:00") - new Date()) / 86400000);
}
async function log(text, action) {
  const ev = { id: crypto.randomUUID(), at: new Date().toISOString(), text: String(text || "").slice(0, 480), by: (state.settings.specialist || ""), action: action || "note" };
  state.events.unshift(ev);
  if (!(cloud && cloud.live)) markPendingEvent(ev.id);
  save();
  if (typeof cloudUpsert === "function") {
    try {
      await cloudUpsert("events", ev.id, ev);
      if (cloud && cloud.live) clearPendingEvent(ev.id);
    } catch (_) {
      markPendingEvent(ev.id);
    }
  }
}
function countsByHospital(hid) {
  const units = state.units.filter(u => u.hospitalId === hid && inStock(u));
  const out = { total: units.length };
  SIZES.forEach(s => { out[s] = units.filter(u => catalogOf(u.sku).size === s).length; });
  return out;
}
function liveUnits() { return state.units.filter(inStock); }
function renderHome() {
  const live = liveUnits();
  const exp90 = live.filter(u => daysTo(u.expiry) <= 90);
  const exp30 = live.filter(u => daysTo(u.expiry) <= 30);
  document.getElementById("k-units").textContent = live.length;
  document.getElementById("k-sites").textContent = new Set(live.map(u => u.hospitalId)).size;
  document.getElementById("k-exp").textContent = exp90.length;
  document.getElementById("k-hot").textContent = exp30.length;
  document.getElementById("k-exp").parentElement.className = "kpi" + (exp90.length ? " warn" : "");
  document.getElementById("k-hot").parentElement.className = "kpi" + (exp30.length ? " bad" : "");
  const matrix = MATRIX_FAMILIES.map(group => {
    const body = state.hospitals.map(h => {
      const cells = group.sizes.map(size => {
        const have = countInStock(state.units, h.id, group.family, size, catalogOf);
        const par = parAmount(state.pars, h.id, group.family, size);
        return { have, par };
      });
      if (!cells.some(cell => cell.have || cell.par)) return "";
      return `<tr><td>${esc(h.name)}<div class="tiny">${esc(h.city)}</div></td>${cells.map(cell => {
        const cls = cell.have === 0 ? "zero" : (cell.par > 0 && cell.have < cell.par ? "below" : "okn");
        const note = cell.par > 0 ? `<div class="tiny">${cell.have === 0 ? "at zero" : cell.have < cell.par ? "below " + cell.par : "par " + cell.par}</div>` : "";
        return `<td class="${cls}">${cell.have}${note}</td>`;
      }).join("")}</tr>`;
    }).join("");
    if (!body) return "";
    return `<h3 class="matrix-family">${esc(group.family)}</h3><div class="matrix-scroll"><table class="matrix"><thead><tr><th>Hospital</th>${group.sizes.map(size => `<th>${esc(size)}</th>`).join("")}</tr></thead><tbody>${body}</tbody></table></div>`;
  }).join("");
  const matrixEl = document.getElementById("matrix");
  if (matrixEl) matrixEl.innerHTML = matrix || `<div class="empty">No stock yet</div>`;
  const deficits = reorderDeficits(state.hospitals, state.units, state.pars, catalogOf);
  const alerts = deficits.slice(0, 8).map(line => {
    const badge = line.atZero ? "At zero" : "Below par";
    return esc(badge) + " · " + esc(line.hospital) + " · " + esc(line.family) + " " + esc(line.size) + " · " + line.have + " of " + line.par;
  });
  exp30.forEach(u => alerts.push(esc(catalogOf(u.sku).family) + " " + esc(catalogOf(u.sku).size) + " " + esc(u.serial) + " at " + esc(hospitalOf(u.hospitalId).name) + " expires " + esc(u.expiry)));
  document.getElementById("alerts").innerHTML = alerts.slice(0, 8).map(a => `<div class="flag-line">${a}</div>`).join("") || `<div class="empty">Nothing below par. Set par levels on a hospital to flag reorders.</div>`;
  document.getElementById("activity").innerHTML = state.events.slice(0, 8).map(e => `<div class="row"><div><div class="t">${esc(e.text)}</div><div class="m">${esc(new Date(e.at).toLocaleString("en-GB"))}${e.by ? " · " + esc(e.by) : ""}</div></div></div>`).join("") || `<div class="empty">No activity yet</div>`;
}
function renderFind() {
  const q = (document.getElementById("find-q").value || "").trim().toLowerCase();
  const size = document.getElementById("find-size").value;
  const status = document.getElementById("find-status").value;
  let units = state.units.slice();
  if (status === "in-stock") units = units.filter(inStock);
  if (status === "used") units = units.filter(u => u.status === "used");
  if (size) units = units.filter(u => catalogOf(u.sku).size === size);
  if (q) units = units.filter(u => {
    const h = hospitalOf(u.hospitalId); const c = catalogOf(u.sku);
    return [u.serial, u.sku, u.lot, c.label, c.family, c.size, h.name, h.city, h.region].join(" ").toLowerCase().includes(q);
  });
  units.sort((a, b) => hospitalOf(a.hospitalId).name.localeCompare(hospitalOf(b.hospitalId).name));
  document.getElementById("find-results").innerHTML = units.map(unitCard).join("") || `<div class="empty">Nothing matches. Try XTW or a serial.</div>`;
}
function chipClass(size) {
  const s = (size || "").toLowerCase();
  return ["nt","ntw","xt","xtw","sgc"].includes(s) ? s : "sgc";
}
function unitCard(u) {
  const c = catalogOf(u.sku); const h = hospitalOf(u.hospitalId); const d = daysTo(u.expiry);
  const expNote = !u.expiry ? "" : d < 0 ? "EXPIRED" : d <= 90 ? d + "d left" : u.expiry;
  return `<button class="list-btn" onclick="openUnit('${escJs(u.id)}')"><div class="row"><div><div class="t">${esc(u.serial)}</div><div class="m">${esc(c.sku)} · ${esc(c.label)}</div><span class="chip ${chipClass(c.size)}">${esc(c.size)}</span><span class="chip ${u.status === "in-stock" ? "in" : u.status === "used" ? "used" : "xfer"}">${esc(u.status)}</span></div><div class="r">${esc(h.name)}<div>${esc(expNote)}</div></div></div></button>`;
}
function renderHospitals() {
  const q = (document.getElementById("hosp-q").value || "").trim().toLowerCase();
  document.getElementById("hosp-list").innerHTML = state.hospitals.filter(h => !q || [h.name, h.city, h.region].join(" ").toLowerCase().includes(q)).map(h => {
    const c = countsByHospital(h.id);
    const families = MATRIX_FAMILIES.map(group => {
      const n = group.sizes.reduce((sum, size) => sum + countInStock(state.units, h.id, group.family, size, catalogOf), 0);
      return n ? esc(group.family) + " " + n : "";
    }).filter(Boolean).join(" · ");
    const short = reorderDeficits([h], state.units, state.pars, catalogOf).length;
    return `<div class="card hospital-card" onclick="openHospital('${escJs(h.id)}')"><div class="row" style="padding-top:0"><div><div class="t">${esc(h.name)}</div><div class="m">${esc(h.city)} · ${esc(h.region)}</div><div class="tiny">${families || "No stock recorded"}</div>${short ? `<span class="chip used">${short} below par</span>` : ""}</div><div class="r"><b>${c.total}</b><div>in stock</div></div></div></div>`;
  }).join("");
}
function skuOptions(selected) {
  return state.catalog.map(c => `<option value="${esc(c.sku)}" ${c.sku === selected ? "selected" : ""}>${esc(c.sku)} — ${esc(c.label)}</option>`).join("");
}
function hospOptions(selected) {
  return state.hospitals.map(h => `<option value="${esc(h.id)}" ${h.id === selected ? "selected" : ""}>${esc(h.name)}</option>`).join("");
}
function openHospital(id) {
  const h = hospitalOf(id);
  state.settings.lastHospital = id; save();
  const units = state.units.filter(u => u.hospitalId === id).sort((a, b) => a.status.localeCompare(b.status));
  showModal(`<h2>${esc(h.name)}</h2><p class="hint">${esc(h.city)} · ${esc(h.region)}</p><button class="primary" onclick="prepScan('${escJs(id)}')">Scan into this hospital</button><div style="margin-top:12px">${units.map(unitCard).join("") || "<div class='empty'>No units recorded</div>"}</div>${parEditor(id)}<button class="secondary" onclick="closeModal()">Close</button>`);
}
function parEditor(hospitalId) {
  const blocks = MATRIX_FAMILIES.map(group => {
    const open = group.sizes.some(size => parAmount(state.pars, hospitalId, group.family, size) > 0 || countInStock(state.units, hospitalId, group.family, size, catalogOf) > 0);
    const fields = group.sizes.map(size => {
      const have = countInStock(state.units, hospitalId, group.family, size, catalogOf);
      const par = parAmount(state.pars, hospitalId, group.family, size);
      return `<label class="par-row"><span>${esc(size)} <span class="tiny">in stock ${have}</span></span><input data-par-family="${esc(group.family)}" data-par-size="${esc(size)}" type="number" min="0" max="99" inputmode="numeric" value="${par}"></label>`;
    }).join("");
    return `<details class="par-block"${open ? " open" : ""}><summary>${esc(group.family)}</summary>${fields}</details>`;
  }).join("");
  return `<h2 class="matrix-family">Par levels</h2><p class="hint">How many of each size should be on the shelf. Delivery systems and bundles of the same size count together. 0 means this site does not stock that size. G4 and G5 stay separate, and TriClip is not mixed with MitraClip.</p>${blocks}<button class="primary" type="button" onclick="saveHospitalPars('${escJs(hospitalId)}')">Save par levels</button>`;
}
async function saveHospitalPars(hospitalId) {
  const inputs = document.querySelectorAll("#modal-body [data-par-size]");
  for (const input of inputs) {
    const family = input.getAttribute("data-par-family");
    const size = input.getAttribute("data-par-size");
    let par = parseInt(input.value, 10);
    if (!Number.isFinite(par) || par < 0) par = 0;
    if (par > 99) par = 99;
    const id = parDocId(hospitalId, family, size);
    const existing = state.pars.find(item => item.id === id);
    if (par === 0) {
      if (existing) {
        state.pars = state.pars.filter(item => item.id !== id);
        markPendingParDelete(id);
        if (cloud && cloud.live && typeof cloudDelete === "function") {
          try { await cloudDelete("pars", id); clearPendingParDelete(id); } catch (e) { toast(e.message); }
        }
      }
      continue;
    }
    const row = { id, hospitalId, family, familyKey: familyKey(family), size, par, updatedAt: new Date().toISOString() };
    if (existing) Object.assign(existing, row);
    else state.pars.push(row);
    if (!(cloud && cloud.live)) markPendingPar(id);
    if (cloud && cloud.live && typeof cloudUpsert === "function") {
      try { await cloudUpsert("pars", id, row); clearPendingPar(id); }
      catch (e) { markPendingPar(id); toast(e.message); }
    }
  }
  save();
  closeModal();
  refresh();
  toast(cloud && cloud.live ? "Par levels saved for the team" : "Par levels saved on this phone");
}
function exportReorder() {
  const lines = reorderDeficits(state.hospitals, state.units, state.pars, catalogOf);
  const rows = [["hospital", "family", "size", "in stock", "par", "short", "at zero"]];
  lines.forEach(line => rows.push([line.hospital, line.family, line.size, String(line.have), String(line.par), String(line.short), line.atZero ? "yes" : "no"]));
  download(new Blob([toCsv(rows)], { type: "text/csv" }), "teer-reorder-" + dateStamp() + ".csv");
}
async function shareReorder() {
  const lines = reorderDeficits(state.hospitals, state.units, state.pars, catalogOf);
  const text = lines.length
    ? lines.map(line => line.hospital + ": " + line.family + " " + line.size + " has " + line.have + ", par " + line.par + ", short " + line.short).join("\n")
    : "Nothing is below par.";
  if (navigator.share) {
    try { await navigator.share({ title: "TEER reorder list", text }); return; }
    catch (e) { if (e && e.name === "AbortError") return; }
  }
  exportReorder();
  toast("Reorder list downloaded");
}
function openUnit(id) {
  const u = state.units.find(x => x.id === id); if (!u) return;
  const c = catalogOf(u.sku);
  const canDelete = !(cloud && cloud.live) || !!(cloud && cloud.isAdmin);
  const deleteControl = canDelete
    ? `<button class="danger" onclick="deleteUnit('${escJs(u.id)}')">Delete unit</button>`
    : `<p class="hint">Only an admin can delete a unit from the shared list. The deletion is written to the activity log.</p>`;
  showModal(`<h2>${esc(u.serial)}</h2><p class="hint">${esc(c.sku)} · ${esc(c.label)}<br>${esc(hospitalOf(u.hospitalId).name)} · ${esc(u.status)}${u.updatedBy ? "<br>Last edit: " + esc(u.updatedBy) : ""}</p><div class="grid-2"><div class="field"><label>SKU</label><select id="u-sku">${skuOptions(u.sku)}</select></div><div class="field"><label>Hospital</label><select id="u-hosp">${hospOptions(u.hospitalId)}</select></div><div class="field"><label>Serial</label><input id="u-sn" value="${esc(u.serial)}"></div><div class="field"><label>Expiry</label><input id="u-exp" type="date" value="${esc(u.expiry || "")}"></div><div class="field"><label>Status</label><select id="u-st"><option ${u.status==="in-stock"?"selected":""}>in-stock</option><option ${u.status==="used"?"selected":""}>used</option><option ${u.status==="in-transit"?"selected":""}>in-transit</option><option ${u.status==="quarantine"?"selected":""}>quarantine</option></select></div><div class="field"><label>Lot</label><input id="u-lot" value="${esc(u.lot || "")}"></div><div class="field span2"><label>Notes</label><textarea id="u-notes">${esc(u.notes || "")}</textarea></div></div><button class="primary" onclick="saveUnit('${escJs(u.id)}')">Save</button><button class="secondary" onclick="markUsed('${escJs(u.id)}')">Mark used in case</button><button class="secondary" onclick="startTransfer('${escJs(u.id)}')">Borrow / transfer</button>${deleteControl}`);
}
async function saveUnit(id) {
  const u = state.units.find(x => x.id === id);
  const nextSerial = document.getElementById("u-sn").value.trim();
  if (!nextSerial) { toast("Serial is required"); return; }
  if (serialClash(nextSerial, id)) { toast("That serial is already on the list"); return; }
  const nextH = document.getElementById("u-hosp").value;
  const moved = nextH !== u.hospitalId;
  u.sku = document.getElementById("u-sku").value;
  u.hospitalId = nextH;
  u.serial = nextSerial;
  u.expiry = document.getElementById("u-exp").value;
  u.status = document.getElementById("u-st").value;
  u.lot = document.getElementById("u-lot").value.trim();
  u.notes = document.getElementById("u-notes").value.trim();
  u.updatedAt = new Date().toISOString();
  await saveUnitCloud(u);
  await log(moved ? ("Moved " + u.serial + " to " + hospitalOf(u.hospitalId).name) : ("Updated " + u.serial), moved ? "transfer" : "update");
  closeModal(); refresh(); toast(cloud && cloud.live ? "Saved for the team" : "Saved on this phone");
}
async function markUsed(id) {
  const u = state.units.find(x => x.id === id);
  if (!u) return;
  if (!confirm("Mark " + u.serial + " as used at " + hospitalOf(u.hospitalId).name + "? It comes off the in-stock board. You can set the status back to in stock afterwards.")) return;
  u.status = "used"; u.updatedAt = new Date().toISOString();
  await saveUnitCloud(u);
  await log("Used " + u.serial + " (" + catalogOf(u.sku).size + ") at " + hospitalOf(u.hospitalId).name, "use");
  closeModal(); refresh(); toast("Marked used");
}
function recordDelete(unit) {
  const event = { id: "del-" + unit.id, at: new Date().toISOString(), text: "Deleted " + unit.serial, by: state.settings.specialist || "", action: "delete" };
  state.events = state.events.filter(item => item.id !== event.id);
  state.events.unshift(event);
}
async function deleteUnit(id) {
  const u = state.units.find(x => x.id === id);
  if (!u) return;
  if (cloud && cloud.live && !cloud.isAdmin) {
    toast("Only an admin can delete a unit from the shared list.");
    return;
  }
  const shared = !!(cloud && cloud.live);
  if (!confirm(shared
    ? "Delete " + u.serial + " from the shared list? Only an admin can do this, and it is written to the activity log."
    : "Delete " + u.serial + " from this phone? If you are signed in later as an admin, the shared copy is deleted too and written to the activity log.")) return;
  if (shared && typeof cloudDeleteUnit === "function") {
    try { await cloudDeleteUnit(u.id, u.serial); }
    catch (e) { toast(e.message || "Could not delete that unit"); return; }
  } else {
    markPendingDelete(u.id, u.serial);
  }
  state.units = state.units.filter(x => x.id !== id);
  recordDelete(u);
  save();
  closeModal(); refresh(); toast(shared ? "Deleted from the shared list" : "Deleted on this phone");
}
function startTransfer(id) {
  const u = state.units.find(x => x.id === id);
  showModal(`<h2>Transfer ${esc(u.serial)}</h2><p class="hint">Currently at ${esc(hospitalOf(u.hospitalId).name)}</p><div class="field"><label>Send to</label><select id="xfer-to">${hospOptions("")}</select></div><div class="field" style="margin-top:8px"><label>Reason</label><input id="xfer-why" placeholder="Case support / borrow"></div><button class="primary" onclick="doTransfer('${escJs(id)}')">Move now</button><button class="secondary" onclick="openUnit('${escJs(id)}')">Back</button>`);
}
async function doTransfer(id) {
  const u = state.units.find(x => x.id === id);
  const to = document.getElementById("xfer-to").value;
  const why = document.getElementById("xfer-why").value.trim();
  if (to === u.hospitalId) { toast("Pick a different hospital"); return; }
  const from = hospitalOf(u.hospitalId).name;
  u.hospitalId = to; u.status = "in-stock";
  u.notes = [u.notes, why ? "Transfer: " + why : "Transfer"].filter(Boolean).join(" | ");
  u.updatedAt = new Date().toISOString();
  await saveUnitCloud(u);
  await log("Transferred " + u.serial + " " + from + " → " + hospitalOf(to).name + (why ? " · " + why : ""), "transfer");
  closeModal(); refresh(); toast("Transferred");
}
function parseUDI(text) {
  const raw = (text || "").trim();
  const out = { serial: "", sku: "", expiry: "", lot: "", raw };
  const gs = raw.replace(/\u001d/g, "");
  const m21 = gs.match(/(?:\(21\)|21)([A-Z0-9\-]{4,20})/i);
  const m17 = gs.match(/(?:\(17\)|17)(\d{6})/);
  const m10 = gs.match(/(?:\(10\)|10)([A-Z0-9\-]{2,20})/i);
  if (m21) out.serial = m21[1];
  if (m10) out.lot = m10[1];
  if (m17) out.expiry = "20" + m17[1].slice(0,2) + "-" + m17[1].slice(2,4) + "-" + m17[1].slice(4,6);
  const skuHit = state.catalog.find(c => raw.toUpperCase().includes(c.sku.toUpperCase()));
  if (skuHit) out.sku = skuHit.sku;
  if (!out.serial) { const loose = raw.match(/[A-Z0-9]{6,}/); if (loose) out.serial = loose[0]; }
  return out;
}
function fillScanFrom(text) {
  const p = parseUDI(text);
  if (p.serial) document.getElementById("scan-sn").value = p.serial;
  if (p.sku) document.getElementById("scan-sku").value = p.sku;
  if (p.expiry) document.getElementById("scan-exp").value = p.expiry;
  if (p.lot) document.getElementById("scan-lot").value = p.lot;
  document.getElementById("scan-raw").textContent = p.raw || "";
}
let html5Qr;
async function startCamera() {
  window.__cameraReader = "legacy";
  const box = document.getElementById("reader"); box.style.display = "block";
  if ("BarcodeDetector" in window) {
    try {
      const det = new BarcodeDetector({ formats: ["code_128", "data_matrix", "qr_code", "ean_13", "code_39"] });
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      let video = document.getElementById("native-video");
      if (!video) { video = document.createElement("video"); video.id = "native-video"; video.setAttribute("playsinline", "true"); video.style.width = "100%"; box.innerHTML = ""; box.appendChild(video); }
      video.srcObject = stream; await video.play();
      const tick = async () => {
        if (!video.srcObject) return;
        try { const codes = await det.detect(video); if (codes[0]) { fillScanFrom(codes[0].rawValue); toast("Scanned"); stopCamera(); return; } } catch (_) {}
        requestAnimationFrame(tick);
      };
      tick(); return;
    } catch (e) { console.warn(e); }
  }
  if (!window.Html5Qrcode) { toast("Type the serial instead."); return; }
  html5Qr = new Html5Qrcode("reader");
  try { await html5Qr.start({ facingMode: "environment" }, { fps: 10, qrbox: { width: 260, height: 140 } }, (txt) => { fillScanFrom(txt); toast("Scanned"); stopCamera(); }); }
  catch (e) { toast("Camera blocked. Use type / photo instead."); }
}
async function stopCamera() {
  const video = document.getElementById("native-video");
  if (video && video.srcObject) { video.srcObject.getTracks().forEach(t => t.stop()); video.srcObject = null; }
  if (html5Qr) { try { await html5Qr.stop(); } catch (_) {} html5Qr = null; }
}
function prepScan(hospitalId) { closeModal(); showScreen("scan"); document.getElementById("scan-hosp").value = hospitalId; }
async function addScanned() {
  const serial = document.getElementById("scan-sn").value.trim();
  const sku = document.getElementById("scan-sku").value;
  const hospitalId = document.getElementById("scan-hosp").value;
  if (!serial || !sku || !hospitalId) { toast("Serial, SKU and hospital required"); return; }
  const existing = state.units.find(u => u.serial.toLowerCase() === serial.toLowerCase());
  if (existing && existing.status !== "in-stock") {
    const ok = confirm(serial + " is marked " + existing.status + " at " + hospitalOf(existing.hospitalId).name + ". Put it back in stock at " + hospitalOf(hospitalId).name + "?");
    if (!ok) { toast("No change made"); return; }
  } else if (existing && existing.hospitalId !== hospitalId) {
    const ok = confirm(serial + " is already in stock at " + hospitalOf(existing.hospitalId).name + ". Move it to " + hospitalOf(hospitalId).name + "?");
    if (!ok) { toast("No change made"); return; }
  }
  if (existing) {
    existing.hospitalId = hospitalId; existing.sku = sku;
    existing.expiry = document.getElementById("scan-exp").value;
    existing.lot = document.getElementById("scan-lot").value.trim();
    existing.status = "in-stock"; existing.updatedAt = new Date().toISOString();
    await saveUnitCloud(existing);
    await log("Re-scanned " + serial + " at " + hospitalOf(hospitalId).name, "update");
    toast("Updated existing serial");
  } else {
    const u = { id: crypto.randomUUID(), hospitalId, sku, serial, lot: document.getElementById("scan-lot").value.trim(), expiry: document.getElementById("scan-exp").value, status: "in-stock", notes: "", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    state.units.push(u); await saveUnitCloud(u);
    await log("Received " + serial + " (" + catalogOf(sku).size + ") at " + hospitalOf(hospitalId).name, "receive");
    toast(cloud && cloud.live ? "On the shared list" : "Added on this phone");
  }
  document.getElementById("scan-sn").value = "";
  document.getElementById("scan-lot").value = "";
  document.getElementById("scan-exp").value = "";
  document.getElementById("scan-raw-in").value = "";
  document.getElementById("scan-raw").textContent = "";
  if (typeof seenCodes !== "undefined" && seenCodes && seenCodes.clear) seenCodes.clear();
  refresh();
}
async function addHospital() {
  const name = document.getElementById("new-hosp").value.trim(); if (!name) return;
  const id = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  if (state.hospitals.find(h => h.id === id)) { toast("Already exists"); return; }
  const h = { id, name, city: document.getElementById("new-city").value.trim(), region: "Custom", custom: true };
  state.hospitals.push(h);
  document.getElementById("new-hosp").value = ""; document.getElementById("new-city").value = ""; save();
  if (typeof cloudUpsert === "function") { try { await cloudUpsert("hospitals", id, h); } catch (_) {} }
  fillSelects(); renderHospitals(); toast("Hospital added");
}
function exportJSON() {
  download(new Blob([JSON.stringify(phoneBackup(state), null, 2)], { type: "application/json" }), "teer-consignment-" + dateStamp() + ".json");
}
function exportCSV() {
  const csv = unitsToCsv(state.units, { hospital: hospitalOf, catalog: catalogOf });
  download(new Blob([csv], { type: "text/csv" }), "teer-consignment-" + dateStamp() + ".csv");
}
function dateStamp() { return new Date().toISOString().slice(0, 10); }
function download(blob, name) { const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; a.click(); }
let csvReview = null;
function importFile(file) {
  const reader = new FileReader();
  reader.onload = async () => {
    try {
      if (file.name.toLowerCase().endsWith(".csv")) await startCsvImport(reader.result);
      else await importJson(JSON.parse(reader.result));
    } catch (e) { toast("Could not import: " + e.message); }
  };
  reader.readAsText(file);
  const input = document.getElementById("import-file");
  if (input) input.value = "";
}
async function importJson(data) {
  if (!data || !Array.isArray(data.units)) throw new Error("No units array");
  const touched = new Set((data.units || []).map(u => normSerial(u.serial)).filter(Boolean));
  state.units = mergeImportedUnits(state.units, data.units || [], () => crypto.randomUUID());
  if (!(cloud && cloud.live)) {
    state.units.forEach(u => { if (touched.has(normSerial(u.serial))) markPendingUnit(u.id); });
  }
  (data.hospitalsExtra || []).forEach(h => { if (h && !state.hospitals.find(x => x.id === h.id)) state.hospitals.push(h); });
  const applied = applyPhoneBackup(state, data);
  state.pars = applied.pars;
  state.settings = applied.settings;
  if (Array.isArray(data.pars) && !(cloud && cloud.live)) state.pars.forEach(par => markPendingPar(par.id));
  await log("Imported snapshot (" + data.units.length + " units)", "import");
  save();
  if (cloud && cloud.live) await pushLocalUp();
  fillSelects();
  refresh();
  toast(Array.isArray(data.pars) ? "Imported units and par levels" : "Imported");
}
const UNIT_STATUSES = ["in-stock", "used", "in-transit", "quarantine"];
async function startCsvImport(text) {
  const plan = planCsvRows(state.hospitals, csvToUnitRows(text));
  if (!plan.matched.length && !plan.unmatched.length) throw new Error("No serials in that file");
  if (plan.unmatched.length) {
    csvReview = plan;
    showCsvReview();
    return;
  }
  await applyCsvRows(plan.matched, 0);
}
function showCsvReview() {
  const rows = csvReview.unmatched.map(row => {
    const name = String(row.hospital || "").trim();
    const create = name ? `<option value="__create__">Create “${esc(name)}” as a new hospital</option>` : "";
    return `<div class="csv-unmatched"><div class="t">${esc(row.serial || "No serial")} · ${esc(row.sku || "No SKU")}</div><div class="m">${esc(name || "No hospital name")}</div><div class="field" style="margin-top:8px"><label>What should happen to this row?</label><select data-csv-choice="${esc(String(row.index))}"><option value="__skip__">Skip this row</option>${create}${hospOptions("")}</select></div></div>`;
  }).join("");
  const matched = csvReview.matched.length;
  const unmatched = csvReview.unmatched.length;
  const matchedLine = matched === 1 ? "1 row matches a hospital exactly." : matched + " rows match a hospital exactly.";
  const unmatchedLine = unmatched === 1 ? "1 does not." : unmatched + " do not.";
  showModal(`<h2>Check hospital names</h2><p class="hint">${matchedLine} ${unmatchedLine} Nothing is imported until you choose. A name is never guessed from the city, so “St Thomas' Hospital, London” will not be filed at Barts.</p>${rows}<button class="primary" type="button" onclick="confirmCsvImport()">Import reviewed rows</button><button class="secondary" type="button" onclick="cancelCsvImport()">Cancel</button>`);
}
function cancelCsvImport() {
  csvReview = null;
  closeModal();
  toast("Import cancelled");
}
function createHospitalRecord(name) {
  const trimmed = String(name || "").trim();
  if (!trimmed) return null;
  const found = matchHospital(state.hospitals, trimmed);
  if (found) return found;
  const base = trimmed.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "hospital";
  let id = base;
  let n = 2;
  while (state.hospitals.some(h => h.id === id)) {
    id = base + "-" + n;
    n += 1;
  }
  const hospital = { id, name: trimmed, city: "", region: "Custom", custom: true };
  state.hospitals.push(hospital);
  if (typeof cloudUpsert === "function") cloudUpsert("hospitals", id, hospital).catch(() => {});
  return hospital;
}
async function confirmCsvImport() {
  if (!csvReview) return;
  const resolved = [];
  let skipped = 0;
  csvReview.unmatched.forEach(row => {
    const sel = document.querySelector('[data-csv-choice="' + row.index + '"]');
    const choice = sel ? sel.value : "skip";
    if (!choice || choice === "__skip__" || choice === "skip") { skipped += 1; return; }
    if (choice === "__create__" || choice === "create") {
      const hospital = createHospitalRecord(row.hospital);
      if (!hospital) { skipped += 1; return; }
      resolved.push(Object.assign({}, row, { hospitalId: hospital.id }));
      return;
    }
    resolved.push(Object.assign({}, row, { hospitalId: choice }));
  });
  const rows = csvReview.matched.concat(resolved);
  csvReview = null;
  closeModal();
  await applyCsvRows(rows, skipped);
}
async function applyCsvRows(rows, skipped) {
  let n = 0;
  rows.forEach(cols => {
    const serial = String(cols.serial || "").trim();
    if (!serial || !cols.hospitalId) return;
    const existing = state.units.find(u => normSerial(u.serial) === normSerial(serial));
    const status = UNIT_STATUSES.includes(cols.status) ? cols.status : "in-stock";
    const row = { hospitalId: cols.hospitalId, sku: cols.sku || "CDS0802-XTW", serial, lot: cols.lot || "", expiry: cols.expiry || "", status, notes: cols.notes || "", updatedAt: new Date().toISOString() };
    if (existing) Object.assign(existing, row);
    else state.units.push(Object.assign({ id: crypto.randomUUID(), createdAt: new Date().toISOString() }, row));
    const saved = existing || state.units[state.units.length - 1];
    if (!(cloud && cloud.live)) markPendingUnit(saved.id);
    n += 1;
  });
  await log("Imported CSV (" + n + " rows" + (skipped ? ", skipped " + skipped : "") + ")", "import");
  save();
  if (cloud && cloud.live) await pushLocalUp();
  fillSelects();
  refresh();
  toast("Imported " + n + (skipped ? ". Skipped " + skipped : ""));
}
function resetDemo() {
  if (!confirm("Replace local data with the demo consignment?")) return;
  state.units = demoUnits();
  state.pars = demoPars();
  state.events = [{ id: crypto.randomUUID(), at: new Date().toISOString(), text: "Demo consignment reloaded", action: "note" }];
  save(); refresh(); toast("Demo loaded");
}
function wipeAll() {
  if (cloud && cloud.live) {
    toast("Sign out first. Erase clears this phone only, and the shared list would refill it while you are signed in.");
    return;
  }
  if (!confirm("Erase every unit on this phone? The shared list is not changed. If you sign in later, shared units load again.")) return;
  state.units = [];
  if (state.sync) state.sync.pendingUnitIds = [];
  state.events.unshift({ id: crypto.randomUUID(), at: new Date().toISOString(), text: "Cleared units on this phone. The shared list was not changed.", by: state.settings.specialist || "", action: "note" });
  save(); refresh(); toast("Units cleared on this phone");
}
function showScreen(id) {
  document.querySelectorAll(".screen").forEach(s => s.classList.toggle("active", s.id === "screen-" + id));
  document.querySelectorAll(".nav button").forEach(b => b.classList.toggle("active", b.dataset.screen === id));
  if (id !== "scan" && typeof window.stopCamera === "function") window.stopCamera();
  if (id === "home") renderHome();
  if (id === "find") renderFind();
  if (id === "hospitals") renderHospitals();
  if (id === "team" && typeof setLiveUi === "function") setLiveUi();
  if (id === "team" && typeof renderAccess === "function") renderAccess();
}
function showModal(html) { document.getElementById("modal-body").innerHTML = html; document.getElementById("modal").classList.add("on"); }
function closeModal() { document.getElementById("modal").classList.remove("on"); }
function fillSelects() {
  document.getElementById("scan-sku").innerHTML = skuOptions(state.settings.lastSku || "CDS0802-XTW");
  document.getElementById("scan-hosp").innerHTML = hospOptions(state.settings.lastHospital);
  document.getElementById("who").value = state.settings.specialist || "";
  const cfg = typeof loadFbConfig === "function" ? loadFbConfig() : null;
  if (cfg && document.getElementById("fb-json")) document.getElementById("fb-json").value = JSON.stringify(cfg, null, 2);
}
function refresh() {
  document.getElementById("who-label").textContent = state.settings.specialist || "UK TEER team";
  renderHome(); renderFind(); renderHospitals();
  if (typeof setLiveUi === "function") setLiveUi();
}
function bind() {
  document.querySelectorAll(".nav button").forEach(b => b.addEventListener("click", () => showScreen(b.dataset.screen)));
  document.getElementById("find-q").addEventListener("input", renderFind);
  document.getElementById("find-size").addEventListener("change", renderFind);
  document.getElementById("find-status").addEventListener("change", renderFind);
  document.getElementById("hosp-q").addEventListener("input", renderHospitals);
  document.getElementById("btn-cam").addEventListener("click", () => window.startCamera());
  document.getElementById("btn-cam-stop").addEventListener("click", () => window.stopCamera());
  document.getElementById("btn-add").addEventListener("click", addScanned);
  document.getElementById("scan-raw-in").addEventListener("change", (e) => fillScanFrom(e.target.value));
  document.getElementById("scan-photo").addEventListener("change", async (e) => {
    const file = e.target.files[0]; if (!file) return;
    if ("BarcodeDetector" in window) {
      try {
        const det = new BarcodeDetector({ formats: ["code_128", "data_matrix", "qr_code", "ean_13"] });
        const codes = await det.detect(await createImageBitmap(file));
        if (codes[0]) { fillScanFrom(codes[0].rawValue); toast("Read from photo"); return; }
      } catch (_) {}
    }
    toast("Could not read barcode from photo — type serial");
  });
  document.getElementById("btn-add-hosp").addEventListener("click", addHospital);
  document.getElementById("btn-export-json").addEventListener("click", exportJSON);
  document.getElementById("btn-export-csv").addEventListener("click", exportCSV);
  document.getElementById("import-file").addEventListener("change", (e) => { if (e.target.files[0]) importFile(e.target.files[0]); });
  document.getElementById("btn-demo").addEventListener("click", resetDemo);
  document.getElementById("btn-wipe").addEventListener("click", wipeAll);
  document.getElementById("who").addEventListener("change", () => { state.settings.specialist = document.getElementById("who").value.trim(); save(); refresh(); if (typeof beatPresence === "function") beatPresence(); });
  document.getElementById("scan-hosp").addEventListener("change", () => { state.settings.lastHospital = document.getElementById("scan-hosp").value; save(); });
  document.getElementById("scan-sku").addEventListener("change", () => { state.settings.lastSku = document.getElementById("scan-sku").value; save(); });
  document.getElementById("modal").addEventListener("click", (e) => { if (e.target.id === "modal") closeModal(); });
  document.getElementById("btn-save-fb").addEventListener("click", async () => {
    try { saveFbConfig(parseFirebaseConfig(document.getElementById("fb-json").value)); toast("Config saved on this phone"); await initCloud(); }
    catch (e) { toast(e.message); }
  });
  document.getElementById("btn-signin").addEventListener("click", async () => {
    try { await signInEmail(document.getElementById("fb-email").value.trim(), document.getElementById("fb-pass").value, false); toast("Signed in"); }
    catch (e) { toast(e.message); }
  });
  document.getElementById("btn-signup").addEventListener("click", async () => {
    try { await signInEmail(document.getElementById("fb-email").value.trim(), document.getElementById("fb-pass").value, true); toast("Account created"); }
    catch (e) { toast(e.message); }
  });
  document.getElementById("btn-google").addEventListener("click", async () => {
    try { await signInGoogle(); toast("Signed in with Google"); } catch (e) { toast(e.message); }
  });
  document.getElementById("btn-signout").addEventListener("click", async () => { await signOutCloud(); toast("Signed out"); });
  document.getElementById("btn-push-up").addEventListener("click", pushLocalUp);
  const earlier = document.getElementById("btn-earlier");
  if (earlier) earlier.addEventListener("click", () => { if (typeof loadEarlierEvents === "function") loadEarlierEvents(); });
  const reorderCsv = document.getElementById("btn-reorder-csv");
  if (reorderCsv) reorderCsv.addEventListener("click", exportReorder);
  const reorderShare = document.getElementById("btn-reorder-share");
  if (reorderShare) reorderShare.addEventListener("click", shareReorder);
}
load(); fillSelects(); bind(); refresh(); initCloud();
if ("serviceWorker" in navigator) navigator.serviceWorker.register("./sw.js");
