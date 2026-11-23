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
  return { pendingUnitIds: [], pendingDeleteIds: [], seenUnitIds: [], pendingEventIds: [], pendingParIds: [], pendingParDeleteIds: [], seenParIds: [] };
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
function markPendingDelete(id) {
  if (!id || !state.sync) return;
  clearPendingUnit(id);
  if (!state.sync.pendingDeleteIds.includes(id)) state.sync.pendingDeleteIds.push(id);
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
let toastTimer = null;
let activityShown = 8;
function toast(msg, undo) {
  const el = document.getElementById("toast");
  el.replaceChildren();
  const text = document.createElement("span");
  text.textContent = msg;
  el.appendChild(text);
  if (typeof undo === "function") {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "toast-undo";
    button.textContent = "Undo";
    button.addEventListener("click", () => {
      clearTimeout(toastTimer);
      el.classList.remove("on");
      undo();
    });
    el.appendChild(button);
  }
  el.classList.add("on");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.classList.remove("on"); }, undo ? 6000 : 2200);
}
function hasEarlierActivity() {
  const moreLocal = state.events.length > activityShown;
  const moreCloud = typeof cloud !== "undefined" && cloud.live && cloud.eventsHasMore;
  return moreLocal || moreCloud;
}
function catalogOf(sku) { return state.catalog.find(c => c.sku === sku) || { sku, size: "?", kind: "?", label: sku, family: "" }; }
function hospitalOf(id) { return state.hospitals.find(h => h.id === id) || { name: id, city: "", region: "" }; }
function inStock(u) { return u.status === "in-stock"; }
function daysTo(exp) {
  if (typeof daysUntilExpiry === "function") {
    const days = daysUntilExpiry(exp, new Date());
    return days == null ? 9999 : days;
  }
  if (!exp) return 9999;
  const days = Math.ceil((new Date(exp + "T00:00:00") - new Date()) / 86400000);
  return days === 0 ? 0 : days;
}
function expiryNote(expiry) {
  const days = daysTo(expiry);
  if (!expiry) return { text: "No expiry", cls: "" };
  if (days < 0) return { text: "Expired", cls: "exp-bad" };
  if (days <= 30) return { text: days + "d left", cls: "exp-bad" };
  if (days <= 90) return { text: days + "d left", cls: "exp-warn" };
  return { text: expiry, cls: "" };
}
function shortSite(hospital) {
  const name = (hospital && hospital.name) || "";
  const paren = /\(([^)]+)\)/.exec(name);
  if (paren) return paren[1];
  return name.split(",")[0].replace(/^Royal /, "").replace(/^University Hospital /, "") || (hospital && hospital.city) || name;
}
function rememberHospital(id) {
  if (!id) return;
  const list = (state.settings.recentHospitals || []).filter((item) => item && item !== id);
  list.unshift(id);
  state.settings.recentHospitals = list.slice(0, 4);
  state.settings.lastHospital = id;
}
function matrixChipLabel(family) {
  if (family === "All") return "All";
  if (String(family).indexOf("TriClip ") === 0) return "Tri " + family.slice("TriClip ".length);
  if (String(family).indexOf("MitraClip ") === 0) return family.slice("MitraClip ".length);
  return family;
}
function selectedMatrixFamily() {
  const saved = state.settings.matrixFamily || "MitraClip G5";
  if (saved === "All") return "All";
  if (MATRIX_FAMILIES.some((group) => group.family === saved)) return saved;
  return "MitraClip G5";
}
function pendingSyncCount() {
  const sync = state.sync || {};
  const keys = ["pendingUnitIds", "pendingDeleteIds", "pendingEventIds", "pendingParIds", "pendingParDeleteIds"];
  const ids = new Set();
  keys.forEach((key) => (sync[key] || []).forEach((id) => { if (id) ids.add(key + ":" + id); }));
  return ids.size;
}
function lookupDeps() {
  return { catalogOf, hospitalOf, now: new Date() };
}
function unitsOnShelf(hospitalId, family, size) {
  return state.units.filter((unit) => {
    if (!inStock(unit) || unit.hospitalId !== hospitalId) return false;
    const item = catalogOf(unit.sku);
    return item.family === family && item.size === size;
  }).sort((a, b) => daysTo(a.expiry) - daysTo(b.expiry));
}
function spareNote(lender) {
  if (!lender.par) return "no par set";
  if (lender.spare > 0) return lender.spare + " spare above par " + lender.par;
  return "at their par of " + lender.par;
}
function lenderButtons(lenders, family, size) {
  if (!lenders.length) return `<div class="empty">Nowhere else in stock</div>`;
  return lenders.map((lender) => {
    return `<button type="button" class="flag-btn" data-open-shelf="1" data-h="${esc(lender.hospitalId)}" data-f="${esc(family)}" data-s="${esc(size)}"><b>${esc(lender.hospital)}</b> · ${lender.have} in stock<div class="tiny">${esc(lender.city)} · ${esc(spareNote(lender))}</div></button>`;
  }).join("");
}
function cellTone(have, par) {
  if (par > 0 && have === 0) return "zero";
  if (par > 0 && have < par) return "below";
  if (have > 0) return "okn";
  return "muted";
}
async function log(text) {
  const ev = { id: crypto.randomUUID(), at: new Date().toISOString(), text: String(text || "").slice(0, 480), by: (state.settings.specialist || "") };
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
  const exp90 = live.filter((unit) => daysTo(unit.expiry) <= 90);
  const exp30 = live.filter((unit) => daysTo(unit.expiry) <= 30);
  const expired = live.filter((unit) => daysTo(unit.expiry) < 0);
  document.getElementById("k-units").textContent = live.length;
  document.getElementById("k-sites").textContent = new Set(live.map((unit) => unit.hospitalId)).size;
  document.getElementById("k-exp").textContent = exp90.length;
  document.getElementById("k-hot").textContent = exp30.length;
  const expiredEl = document.getElementById("k-expired");
  if (expiredEl) expiredEl.textContent = expired.length ? expired.length + " expired" : "";
  document.getElementById("k-exp").parentElement.className = "kpi" + (exp90.length ? " warn" : "");
  document.getElementById("k-hot").parentElement.className = "kpi" + (exp30.length ? " bad" : "");
  const chosen = selectedMatrixFamily();
  const families = chosen === "All" ? MATRIX_FAMILIES : MATRIX_FAMILIES.filter((group) => group.family === chosen);
  const chips = document.getElementById("matrix-families");
  if (chips) {
    const choices = MATRIX_FAMILIES.map((group) => group.family).concat(["All"]);
    chips.innerHTML = choices.map((family) => `<button type="button" class="chip-btn${family === chosen ? " on" : ""}" data-matrix-family="${esc(family)}">${esc(matrixChipLabel(family))}</button>`).join("");
  }
  const matrix = families.map((group) => {
    const body = state.hospitals.map((hospital) => {
      const cells = group.sizes.map((size) => {
        const have = countInStock(state.units, hospital.id, group.family, size, catalogOf);
        const par = parAmount(state.pars, hospital.id, group.family, size);
        return { have, par, size };
      });
      if (!cells.some((cell) => cell.have || cell.par)) return "";
      return `<tr><td>${esc(shortSite(hospital))}<div class="tiny">${esc(hospital.city)}</div></td>${cells.map((cell) => {
        const cls = cellTone(cell.have, cell.par);
        const note = cell.par > 0 ? `<div class="tiny">${cell.have === 0 ? "at zero" : cell.have < cell.par ? "below " + cell.par : "par " + cell.par}</div>` : "";
        return `<td><button type="button" class="cell ${cls}" data-matrix-cell="1" data-h="${esc(hospital.id)}" data-f="${esc(group.family)}" data-s="${esc(cell.size)}">${cell.have}${note}</button></td>`;
      }).join("")}</tr>`;
    }).join("");
    if (!body) return `<div class="empty">No ${esc(group.family)} on the board yet</div>`;
    const title = chosen === "All" ? `<h3 class="matrix-family">${esc(group.family)}</h3>` : "";
    return `${title}<div class="matrix-scroll"><table class="matrix"><thead><tr><th>Hospital</th>${group.sizes.map((size) => `<th>${esc(size)}</th>`).join("")}</tr></thead><tbody>${body}</tbody></table></div>`;
  }).join("");
  const matrixEl = document.getElementById("matrix");
  if (matrixEl) matrixEl.innerHTML = matrix || `<div class="empty">No stock yet</div>`;
  const board = shortageBoard(state.hospitals, state.units, state.pars, catalogOf);
  const alerts = [];
  board.deficits.slice(0, 6).forEach((line) => {
    const where = formatLenders(line.lenders);
    const badge = line.atZero ? "At zero" : "Below par";
    alerts.push(`<button type="button" class="flag-btn" data-alert="shortage" data-h="${esc(line.hospitalId)}" data-f="${esc(line.family)}" data-s="${esc(line.size)}"><b>${esc(badge)}</b> · ${esc(shortSite(hospitalOf(line.hospitalId)))} · ${esc(line.family)} ${esc(line.size)} · ${line.have} of ${line.par}${where ? `<div class="tiny">Also at ${esc(where)}</div>` : `<div class="tiny">Nowhere else in stock</div>`}</button>`);
  });
  if (board.deficits.length > 6) {
    alerts.push(`<button type="button" class="flag-btn" data-alert="all-short">Show all ${board.deficits.length} short lines</button>`);
  }
  board.guideGaps.slice(0, 4).forEach((gap) => {
    alerts.push(`<button type="button" class="flag-btn" data-alert="guide" data-h="${esc(gap.hospitalId)}" data-f="${esc(gap.family)}"><b>Needs a guide</b> · ${esc(shortSite(hospitalOf(gap.hospitalId)))} · ${esc(gap.family)} · ${gap.clips} loose clip${gap.clips === 1 ? "" : "s"}</button>`);
  });
  exp30.slice().sort((a, b) => daysTo(a.expiry) - daysTo(b.expiry)).slice(0, 4).forEach((unit) => {
    const note = expiryNote(unit.expiry);
    const item = catalogOf(unit.sku);
    alerts.push(`<button type="button" class="flag-btn" data-alert="unit" data-unit="${esc(unit.id)}">${esc(item.family)} ${esc(item.size)} ${esc(unit.serial)} · ${esc(shortSite(hospitalOf(unit.hospitalId)))} · ${esc(note.text)}</button>`);
  });
  document.getElementById("alerts").innerHTML = alerts.join("") || `<div class="empty">Nothing below par, and every loose clip has a guide. Set par levels on a hospital to flag reorders.</div>`;
  document.getElementById("activity").innerHTML = state.events.slice(0, activityShown).map((event) => `<div class="row"><div><div class="t">${esc(event.text)}</div><div class="m">${esc(new Date(event.at).toLocaleString("en-GB"))}${event.by ? " · " + esc(event.by) : ""}</div></div></div>`).join("") || `<div class="empty">No activity yet</div>`;
  const earlier = document.getElementById("btn-earlier");
  if (earlier) earlier.style.display = hasEarlierActivity() ? "block" : "none";
}
function readFindQuery() {
  return {
    q: document.getElementById("find-q").value,
    size: document.getElementById("find-size").value,
    family: document.getElementById("find-family").value,
    status: document.getElementById("find-status").value,
    expiry: document.getElementById("find-expiry").value,
    sort: document.getElementById("find-sort").value
  };
}
function renderFamilyChips() {
  const row = document.getElementById("find-family-chips");
  const select = document.getElementById("find-family");
  if (!row || !select) return;
  const names = [["", "Any"]];
  MATRIX_FAMILIES.forEach((group) => names.push([group.family, matrixChipLabel(group.family)]));
  if (state.catalog.some((item) => item.family === "Accessory")) names.push(["Accessory", "Acc"]);
  row.innerHTML = names.map(([value, label]) => `<button type="button" class="chip-btn${select.value === value ? " on" : ""}" data-find-family="${esc(value)}">${esc(label)}</button>`).join("");
}
function renderFind() {
  renderFamilyChips();
  const query = readFindQuery();
  let units = sortUnits(state.units.filter((unit) => unitMatchesQuery(unit, query, lookupDeps())), query.sort, lookupDeps());
  const summary = document.getElementById("find-summary");
  const box = document.getElementById("find-results");
  const sites = new Set(units.map((unit) => unit.hospitalId)).size;
  const tally = units.length
    ? units.length + " unit" + (units.length === 1 ? "" : "s") + " at " + sites + " hospital" + (sites === 1 ? "" : "s")
    : "Nothing matches.";
  const bits = [];
  if (query.size) bits.push(query.size === "SGC" ? "Guide" : query.size);
  if (query.family) bits.push(query.family);
  if (query.expiry === "expired") bits.push("expired");
  else if (query.expiry === "30") bits.push("within 30 days");
  else if (query.expiry === "90") bits.push("within 90 days");
  if (query.status && query.status !== "in-stock") bits.push(query.status);
  else if (!query.status) bits.push("any status");
  if (summary) summary.textContent = (bits.length ? bits.join(" · ") + " · " : "") + tally;
  const more = document.querySelector("#find-more summary");
  if (more) {
    const active = [query.size, query.family, query.expiry && query.expiry !== "" ? "expiry" : "", query.status && query.status !== "in-stock" ? query.status : ""].filter(Boolean);
    more.textContent = active.length ? "Filters · " + active.join(", ") : "Filters";
  }
  if (!units.length) {
    box.innerHTML = `<div class="card"><div class="empty">Nothing matches. Clear a filter, or try XTW, TriClip, or a serial.</div></div>`;
    return;
  }
  if (query.sort === "expiry" || query.sort === "serial") {
    box.innerHTML = `<div class="card">${units.map(unitCard).join("")}</div>`;
    return;
  }
  box.innerHTML = groupByHospital(units, hospitalOf).map((group) => {
    return `<div class="card find-group"><button type="button" class="find-head" data-open-hospital="${esc(group.hospitalId)}"><span>${esc(group.name)}</span><span class="tiny">${esc(group.city)} · ${group.units.length}</span></button>${group.units.map((unit) => unitCard(unit, { place: false })).join("")}</div>`;
  }).join("");
}
function applyFind(next) {
  const set = (id, value) => {
    const el = document.getElementById(id);
    if (el && value != null) el.value = value;
  };
  set("find-q", next.q != null ? next.q : "");
  set("find-size", next.size != null ? next.size : "");
  set("find-family", next.family != null ? next.family : "");
  set("find-status", next.status != null ? next.status : "in-stock");
  set("find-expiry", next.expiry != null ? next.expiry : "");
  set("find-sort", next.sort != null ? next.sort : "hospital");
  showScreen("find");
}
function jumpKpi(kind) {
  if (kind === "sites") {
    state.settings.hospFilter = "stock";
    save();
    showScreen("hospitals");
    return;
  }
  applyFind({
    q: "",
    size: "",
    family: "",
    status: "in-stock",
    expiry: kind === "exp30" ? "30" : kind === "exp90" ? "90" : "",
    sort: kind === "stock" ? "hospital" : "expiry"
  });
}
function chipClass(size) {
  const s = (size || "").toLowerCase();
  return ["nt","ntw","xt","xtw","sgc"].includes(s) ? s : "sgc";
}
function unitCard(u, opts) {
  const c = catalogOf(u.sku); const h = hospitalOf(u.hospitalId); const exp = expiryNote(u.expiry);
  const lot = u.lot ? " · lot " + esc(u.lot) : "";
  const place = opts && opts.place === false ? "" : esc(shortSite(h));
  return `<button class="list-btn" onclick="openUnit('${escJs(u.id)}')"><div class="row"><div><div class="t">${esc(u.serial)}</div><div class="m">${esc(c.family)} · ${esc(c.sku)}${lot}</div><span class="chip ${chipClass(c.size)}">${esc(c.size)}</span><span class="chip ${u.status === "in-stock" ? "in" : u.status === "used" ? "used" : "xfer"}">${esc(u.status)}</span></div><div class="r">${place ? `<div>${place}</div>` : ""}<div class="${exp.cls}">${esc(exp.text)}</div></div></div></button>`;
}
function renderHospitals() {
  const q = (document.getElementById("hosp-q").value || "").trim().toLowerCase();
  const regionEl = document.getElementById("hosp-region");
  const region = regionEl ? regionEl.value : "";
  const filter = state.settings.hospFilter || "all";
  const board = shortageBoard(state.hospitals, state.units, state.pars, catalogOf);
  const shortIds = new Set(board.deficits.map((line) => line.hospitalId));
  const guideIds = new Set(board.guideGaps.map((gap) => gap.hospitalId));
  const stockIds = new Set(state.hospitals.filter((hospital) => state.units.some((unit) => unit.hospitalId === hospital.id && inStock(unit))).map((hospital) => hospital.id));
  const viewed = state.hospitals.filter((hospital) => {
    if (q && [hospital.name, hospital.city, hospital.region].join(" ").toLowerCase().indexOf(q) === -1) return false;
    if (region && hospital.region !== region) return false;
    return true;
  });
  document.querySelectorAll("#hosp-filters [data-hosp-filter]").forEach((button) => {
    const key = button.getAttribute("data-hosp-filter");
    button.classList.toggle("on", key === filter);
    const count = viewed.filter((hospital) => {
      if (key === "stock") return stockIds.has(hospital.id);
      if (key === "short") return shortIds.has(hospital.id);
      if (key === "guide") return guideIds.has(hospital.id);
      return true;
    }).length;
    const label = { all: "All", stock: "With stock", short: "Below par", guide: "Needs a guide" }[key];
    button.textContent = label + " " + count;
  });
  const rows = viewed.filter((hospital) => {
    if (filter === "stock" && !stockIds.has(hospital.id)) return false;
    if (filter === "short" && !shortIds.has(hospital.id)) return false;
    if (filter === "guide" && !guideIds.has(hospital.id)) return false;
    return true;
  }).map((hospital) => {
    const counts = countsByHospital(hospital.id);
    const families = MATRIX_FAMILIES.map((group) => {
      const n = group.sizes.reduce((sum, size) => sum + countInStock(state.units, hospital.id, group.family, size, catalogOf), 0);
      return n ? esc(group.family) + " " + n : "";
    }).filter(Boolean).join(" · ");
    const short = board.deficits.filter((line) => line.hospitalId === hospital.id).length;
    const guide = guideIds.has(hospital.id) ? `<span class="chip xtw">Needs a guide</span>` : "";
    return `<div class="card hospital-card" onclick="openHospital('${escJs(hospital.id)}')"><div class="row" style="padding-top:0"><div><div class="t">${esc(hospital.name)}</div><div class="m">${esc(hospital.city)} · ${esc(hospital.region)}</div><div class="tiny">${families || "No stock recorded"}</div>${short ? `<span class="chip used">${short} below par</span>` : ""}${guide}</div><div class="r"><b>${counts.total}</b><div>in stock</div></div></div></div>`;
  }).join("");
  const empty = filter === "guide"
    ? "Every loose clip in this view has a guide, or the site only holds bundles."
    : filter === "short"
      ? "Nothing in this view is below par."
      : "No hospitals match.";
  document.getElementById("hosp-list").innerHTML = rows || `<div class="card"><div class="empty">${empty}</div></div>`;
}
function skuOptions(selected) {
  const groups = [];
  state.catalog.forEach((item) => {
    let group = groups.find((entry) => entry.family === item.family);
    if (!group) {
      group = { family: item.family, items: [] };
      groups.push(group);
    }
    group.items.push(item);
  });
  return groups.map((group) => `<optgroup label="${esc(group.family)}">${group.items.map((item) => `<option value="${esc(item.sku)}" ${item.sku === selected ? "selected" : ""}>${esc(item.sku)} — ${esc(item.label)}</option>`).join("")}</optgroup>`).join("");
}
function hospOptions(selected, exceptId) {
  return state.hospitals.filter((hospital) => hospital.id !== exceptId).map((hospital) => `<option value="${esc(hospital.id)}" ${hospital.id === selected ? "selected" : ""}>${esc(hospital.name)}</option>`).join("");
}
function openHospital(id) {
  const h = hospitalOf(id);
  rememberHospital(id);
  save();
  const units = state.units.filter((unit) => unit.hospitalId === id).sort((a, b) => {
    if (a.status !== b.status) return a.status === "in-stock" ? -1 : b.status === "in-stock" ? 1 : a.status.localeCompare(b.status);
    return daysTo(a.expiry) - daysTo(b.expiry);
  });
  const board = shortageBoard([h], state.units, state.pars, catalogOf);
  const flags = board.guideGaps.map((gap) => `<button type="button" class="flag-btn" data-alert="guide" data-h="${esc(id)}" data-f="${esc(gap.family)}">Needs a guide · ${esc(gap.family)} · ${gap.clips} loose clip${gap.clips === 1 ? "" : "s"}</button>`).join("")
    + board.deficits.slice(0, 4).map((line) => `<button type="button" class="flag-btn" data-alert="shortage" data-h="${esc(id)}" data-f="${esc(line.family)}" data-s="${esc(line.size)}">${line.atZero ? "At zero" : "Below par"} · ${esc(line.family)} ${esc(line.size)} · ${line.have} of ${line.par}</button>`).join("");
  showModal(`<h2>${esc(h.name)}</h2><p class="hint">${esc(h.city)} · ${esc(h.region)}</p>${flags}<button class="primary" onclick="prepScan('${escJs(id)}')">Scan into this hospital</button><div style="margin-top:12px">${units.map((unit) => unitCard(unit, { place: false })).join("") || "<div class='empty'>No units recorded</div>"}</div>${parEditor(id)}<button class="secondary" onclick="closeModal()">Close</button>`);
}
function openShelf(hospitalId, family, size) {
  const hospital = hospitalOf(hospitalId);
  const units = unitsOnShelf(hospitalId, family, size);
  const par = parAmount(state.pars, hospitalId, family, size);
  const lenders = lendCandidates(state.hospitals, state.units, state.pars, catalogOf, { hospitalId, family, size });
  const short = units.length === 0 || (par > 0 && units.length < par);
  showModal(`<h2>${esc(hospital.name)}</h2><p class="hint">${esc(family)} ${esc(size)} · ${units.length} in stock${par ? " · par " + par : ""}</p>${units.map((unit) => unitCard(unit, { place: false })).join("") || `<div class="empty">Empty shelf</div>`}${short ? `<h2 class="matrix-family">Who else has it</h2>${lenderButtons(lenders, family, size)}` : ""}<button class="secondary" type="button" onclick="closeModal()">Close</button>`);
}
function openShortage(hospitalId, family, size) {
  const hospital = hospitalOf(hospitalId);
  const units = unitsOnShelf(hospitalId, family, size);
  const par = parAmount(state.pars, hospitalId, family, size);
  const lenders = lendCandidates(state.hospitals, state.units, state.pars, catalogOf, { hospitalId, family, size });
  const badge = units.length === 0 ? "At zero" : "Below par";
  showModal(`<h2>${esc(badge)}</h2><p class="hint">${esc(hospital.name)} · ${esc(family)} ${esc(size)} · ${units.length} of ${par}</p>${units.map((unit) => unitCard(unit, { place: false })).join("")}<h2 class="matrix-family">Who can lend</h2><p class="hint">Spare means that hospital stays at or above its own par after one unit leaves. No par means the whole quantity can move.</p>${lenderButtons(lenders, family, size)}<button class="secondary" type="button" onclick="closeModal()">Close</button>`);
}
function openAllShortages() {
  const board = shortageBoard(state.hospitals, state.units, state.pars, catalogOf);
  const rows = board.deficits.map((line) => {
    const where = formatLenders(line.lenders);
    return `<button type="button" class="flag-btn" data-alert="shortage" data-h="${esc(line.hospitalId)}" data-f="${esc(line.family)}" data-s="${esc(line.size)}"><b>${line.atZero ? "At zero" : "Below par"}</b> · ${esc(line.hospital)} · ${esc(line.family)} ${esc(line.size)} · ${line.have} of ${line.par}${where ? `<div class="tiny">Also at ${esc(where)}</div>` : `<div class="tiny">Nowhere else in stock</div>`}</button>`;
  }).join("");
  showModal(`<h2>Short lines</h2>${rows || `<div class="empty">Nothing is below par</div>`}<button class="secondary" type="button" onclick="closeModal()">Close</button>`);
}
function openGuideGap(hospitalId, family) {
  const hospital = hospitalOf(hospitalId);
  const gap = guideGaps([hospital], state.units, catalogOf).find((item) => item.family === family);
  const clips = gap ? gap.clips : 0;
  const guides = holdersOf(state.hospitals, state.units, catalogOf, { family, kinds: ["SGC"], exceptHospitalId: hospitalId });
  const bundles = holdersOf(state.hospitals, state.units, catalogOf, { family, kinds: ["BUNDLE"], exceptHospitalId: hospitalId });
  const guideRows = guides.map((site) => `<button type="button" class="flag-btn" data-open-shelf="1" data-h="${esc(site.hospitalId)}" data-f="${esc(family)}" data-s="SGC"><b>${esc(site.hospital)}</b> · ${site.have} guide${site.have === 1 ? "" : "s"}<div class="tiny">${esc(site.city)}</div></button>`).join("") || `<div class="empty">No loose guide at another hospital</div>`;
  const bundleRows = bundles.map((site) => `<button type="button" class="flag-btn" data-open-hospital="${esc(site.hospitalId)}"><b>${esc(site.hospital)}</b> · ${site.have} whole bundle${site.have === 1 ? "" : "s"}<div class="tiny">${esc(site.city)}</div></button>`).join("") || `<div class="empty">No bundle of this generation elsewhere</div>`;
  showModal(`<h2>Needs a guide</h2><p class="hint">${esc(hospital.name)} has ${clips} loose ${esc(family)} clip${clips === 1 ? "" : "s"} and no steerable guide. A bundle includes its own guide, so it does not cover these clips.</p><h2 class="matrix-family">Loose guides elsewhere</h2>${guideRows}<h2 class="matrix-family">Whole bundles elsewhere</h2>${bundleRows}<button class="secondary" type="button" onclick="closeModal()">Close</button>`);
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
function reorderText() {
  const board = shortageBoard(state.hospitals, state.units, state.pars, catalogOf);
  const lines = board.deficits.length ? board.deficits.map(formatReorderLine) : ["Nothing is below par."];
  board.guideGaps.forEach((gap) => {
    const where = gap.looseGuides.slice(0, 3).map((site) => site.hospital + " (" + site.have + ")").join("; ");
    lines.push(gap.hospital + ": " + gap.family + " has " + gap.clips + " loose clip(s) and no guide." + (where ? " Guides at " + where + "." : " No loose guide elsewhere."));
  });
  return lines.join("\n");
}
function exportReorder() {
  const board = shortageBoard(state.hospitals, state.units, state.pars, catalogOf);
  const rows = [["hospital", "family", "size", "in stock", "par", "short", "at zero", "also in stock at"]];
  board.deficits.forEach((line) => rows.push([line.hospital, line.family, line.size, String(line.have), String(line.par), String(line.short), line.atZero ? "yes" : "no", formatLenders(line.lenders)]));
  board.guideGaps.forEach((gap) => {
    const where = gap.looseGuides.map((site) => site.hospital + " (" + site.have + " guides)").join("; ");
    rows.push([gap.hospital, gap.family, "GUIDE", String(gap.clips), "", "", "needs a guide", where]);
  });
  download(new Blob([toCsv(rows)], { type: "text/csv" }), "teer-reorder-" + dateStamp() + ".csv");
}
async function shareReorder() {
  const text = reorderText();
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
  const exp = expiryNote(u.expiry);
  const caseAction = u.status === "used"
    ? `<button class="primary" type="button" onclick="restoreStock('${escJs(u.id)}')">Put back in stock</button>`
    : `<button class="primary" type="button" onclick="markUsed('${escJs(u.id)}')">Mark used in case</button>`;
  showModal(`<h2>${esc(u.serial)}</h2><p class="hint">${esc(c.family)} · ${esc(c.sku)} · ${esc(c.label)}<br>${esc(hospitalOf(u.hospitalId).name)} · ${esc(u.status)}${u.updatedBy ? "<br>Last edit: " + esc(u.updatedBy) : ""}<br><span class="${exp.cls}">${esc(exp.text)}</span></p>${caseAction}<button class="secondary" type="button" onclick="startTransfer('${escJs(u.id)}')">Borrow / transfer</button><button class="secondary" type="button" onclick="copySerial('${escJs(u.serial)}')">Copy serial</button><details class="find-more"><summary>Edit details</summary><div class="grid-2"><div class="field"><label>SKU</label><select id="u-sku">${skuOptions(u.sku)}</select></div><div class="field"><label>Hospital</label><select id="u-hosp">${hospOptions(u.hospitalId)}</select></div><div class="field"><label>Serial</label><input id="u-sn" value="${esc(u.serial)}"></div><div class="field"><label>Expiry</label><input id="u-exp" type="date" value="${esc(u.expiry || "")}"></div><div class="field"><label>Status</label><select id="u-st"><option ${u.status==="in-stock"?"selected":""}>in-stock</option><option ${u.status==="used"?"selected":""}>used</option><option ${u.status==="in-transit"?"selected":""}>in-transit</option><option ${u.status==="quarantine"?"selected":""}>quarantine</option></select></div><div class="field"><label>Lot</label><input id="u-lot" value="${esc(u.lot || "")}"></div><div class="field span2"><label>Notes</label><textarea id="u-notes">${esc(u.notes || "")}</textarea></div></div><button class="primary" type="button" onclick="saveUnit('${escJs(u.id)}')">Save</button><button class="danger" type="button" onclick="deleteUnit('${escJs(u.id)}')">Delete unit</button></details>`);
}
function copySerial(serial) {
  const text = String(serial || "");
  const field = document.getElementById("u-sn");
  const selectField = () => {
    if (!field) return false;
    const details = field.closest("details");
    if (details) details.open = true;
    field.focus();
    field.select();
    try { field.setSelectionRange(0, text.length); } catch (_) {}
    try { return document.execCommand("copy"); } catch (_) { return false; }
  };
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(() => toast("Serial copied")).catch(() => {
      toast(selectField() ? "Serial copied" : "Serial selected — copy it from the field");
    });
    return;
  }
  toast(selectField() ? "Serial copied" : "Serial selected — copy it from the field");
}
async function saveUnit(id) {
  const u = state.units.find(x => x.id === id);
  const nextH = document.getElementById("u-hosp").value;
  const moved = nextH !== u.hospitalId;
  u.sku = document.getElementById("u-sku").value;
  u.hospitalId = nextH;
  u.serial = document.getElementById("u-sn").value.trim();
  u.expiry = document.getElementById("u-exp").value;
  u.status = document.getElementById("u-st").value;
  u.lot = document.getElementById("u-lot").value.trim();
  u.notes = document.getElementById("u-notes").value.trim();
  u.updatedAt = new Date().toISOString();
  await saveUnitCloud(u);
  await log(moved ? ("Moved " + u.serial + " to " + hospitalOf(u.hospitalId).name) : ("Updated " + u.serial));
  closeModal(); refresh(); toast(cloud && cloud.live ? "Saved for the team" : "Saved on this phone");
}
async function setStatus(id, status, logText, toastText) {
  const u = state.units.find(x => x.id === id);
  if (!u) return;
  const previous = u.status;
  if (previous === status) { toast("Already " + status); return; }
  u.status = status;
  u.updatedAt = new Date().toISOString();
  await saveUnitCloud(u);
  await log(logText);
  closeModal();
  refresh();
  toast(toastText, () => setStatus(id, previous, "Restored " + u.serial + " to " + previous, "Restored"));
}
async function markUsed(id) {
  const u = state.units.find(x => x.id === id);
  if (!u) return;
  await setStatus(id, "used", "Used " + u.serial + " (" + catalogOf(u.sku).size + ") at " + hospitalOf(u.hospitalId).name, "Marked used");
}
async function restoreStock(id) {
  const u = state.units.find(x => x.id === id);
  if (!u) return;
  await setStatus(id, "in-stock", "Returned " + u.serial + " to stock at " + hospitalOf(u.hospitalId).name, "Back in stock");
}
async function deleteUnit(id) {
  const u = state.units.find(x => x.id === id);
  if (!confirm("Delete this unit from the shared list?")) return;
  state.units = state.units.filter(x => x.id !== id);
  if (cloud && cloud.live && typeof cloudDelete === "function") {
    try { await cloudDelete("units", id); } catch (e) { markPendingDelete(id); toast(e.message); }
  } else {
    markPendingDelete(id);
  }
  save();
  await log("Deleted " + u.serial); closeModal(); refresh();
}
function startTransfer(id) {
  const u = state.units.find(x => x.id === id);
  const item = catalogOf(u.sku);
  const lenders = lendCandidates(state.hospitals, state.units, state.pars, catalogOf, { hospitalId: u.hospitalId, family: item.family, size: item.size });
  const suggest = lenders.slice(0, 4).map((lender) => {
    return `<button type="button" class="flag-btn" data-pick-hosp="${esc(lender.hospitalId)}">${esc(lender.hospital)} · ${lender.have} in stock · ${esc(spareNote(lender))}</button>`;
  }).join("");
  showModal(`<h2>Transfer ${esc(u.serial)}</h2><p class="hint">${esc(item.family)} ${esc(item.size)} · currently at ${esc(hospitalOf(u.hospitalId).name)}</p>${suggest ? `<p class="hint">Sites that already hold this size. Tap one, then move.</p>${suggest}` : `<p class="hint">No other site has this size in stock.</p>`}<div class="field"><label>Send to</label><select id="xfer-to">${hospOptions("", u.hospitalId)}</select></div><div class="field" style="margin-top:8px"><label>Reason</label><input id="xfer-why" placeholder="Case support / borrow"></div><button class="primary" onclick="doTransfer('${escJs(id)}')">Move now</button><button class="secondary" onclick="openUnit('${escJs(id)}')">Back</button>`);
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
  await log("Transferred " + u.serial + " " + from + " → " + hospitalOf(to).name + (why ? " · " + why : ""));
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
function prepScan(hospitalId) {
  closeModal();
  showScreen("scan");
  document.getElementById("scan-hosp").value = hospitalId;
  rememberHospital(hospitalId);
  save();
  renderRecentHospitals();
}
async function addScanned() {
  const serial = document.getElementById("scan-sn").value.trim();
  const sku = document.getElementById("scan-sku").value;
  const hospitalId = document.getElementById("scan-hosp").value;
  if (!serial || !sku || !hospitalId) { toast("Serial, SKU and hospital required"); return; }
  const existing = state.units.find(u => u.serial.toLowerCase() === serial.toLowerCase());
  if (existing && existing.status !== "in-stock") {
    const ok = confirm(serial + " is marked " + existing.status + " at " + hospitalOf(existing.hospitalId).name + ". Put it back in stock at " + hospitalOf(hospitalId).name + "?");
    if (!ok) { toast("No change made"); return; }
  }
  if (existing) {
    existing.hospitalId = hospitalId; existing.sku = sku;
    existing.expiry = document.getElementById("scan-exp").value;
    existing.lot = document.getElementById("scan-lot").value.trim();
    existing.status = "in-stock"; existing.updatedAt = new Date().toISOString();
    await saveUnitCloud(existing);
    await log("Re-scanned " + serial + " at " + hospitalOf(hospitalId).name);
    toast("Updated existing serial");
  } else {
    const u = { id: crypto.randomUUID(), hospitalId, sku, serial, lot: document.getElementById("scan-lot").value.trim(), expiry: document.getElementById("scan-exp").value, status: "in-stock", notes: "", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    state.units.push(u); await saveUnitCloud(u);
    await log("Received " + serial + " (" + catalogOf(sku).size + ") at " + hospitalOf(hospitalId).name);
    toast(cloud && cloud.live ? "On the shared list" : "Added on this phone");
  }
  rememberHospital(hospitalId);
  save();
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
  download(new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), specialist: state.settings.specialist, units: state.units, events: state.events, hospitalsExtra: state.hospitals.filter(h => h.custom) }, null, 2)], { type: "application/json" }), "teer-consignment-" + dateStamp() + ".json");
}
function exportCSV() {
  const csv = unitsToCsv(state.units, { hospital: hospitalOf, catalog: catalogOf });
  download(new Blob([csv], { type: "text/csv" }), "teer-consignment-" + dateStamp() + ".csv");
}
function dateStamp() { return new Date().toISOString().slice(0, 10); }
function download(blob, name) { const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; a.click(); }
function importFile(file) {
  const reader = new FileReader();
  reader.onload = async () => {
    try {
      if (file.name.toLowerCase().endsWith(".csv")) importCSV(reader.result);
      else {
        const d = JSON.parse(reader.result);
        if (!Array.isArray(d.units)) throw new Error("No units array");
        const touched = new Set((d.units || []).map(u => normSerial(u.serial)).filter(Boolean));
        state.units = mergeImportedUnits(state.units, d.units || [], () => crypto.randomUUID());
        if (!(cloud && cloud.live)) {
          state.units.forEach(u => { if (touched.has(normSerial(u.serial))) markPendingUnit(u.id); });
        }
        (d.hospitalsExtra || []).forEach(h => { if (!state.hospitals.find(x => x.id === h.id)) state.hospitals.push(h); });
        await log("Imported snapshot (" + d.units.length + " units)");
      }
      save(); if (cloud && cloud.live) await pushLocalUp(); fillSelects(); refresh(); toast("Imported");
    } catch (e) { toast("Could not import: " + e.message); }
  };
  reader.readAsText(file);
}
const UNIT_STATUSES = ["in-stock", "used", "in-transit", "quarantine"];
function importCSV(text) {
  const parsed = csvToUnitRows(text);
  let n = 0;
  parsed.forEach(cols => {
    const serial = cols.serial; if (!serial) return;
    const hospName = cols.hospital || "";
    const hosp = state.hospitals.find(h => h.name.toLowerCase() === hospName.toLowerCase()) || state.hospitals.find(h => hospName && h.city && hospName.toLowerCase().includes(h.city.toLowerCase()));
    const sku = cols.sku || "";
    const existing = state.units.find(u => u.serial.toLowerCase() === serial.toLowerCase());
    const status = UNIT_STATUSES.includes(cols.status) ? cols.status : "in-stock";
    const row = { hospitalId: hosp ? hosp.id : state.settings.lastHospital, sku: sku || "CDS0802-XTW", serial, lot: cols.lot || "", expiry: cols.expiry || "", status, notes: cols.notes || "", updatedAt: new Date().toISOString() };
    if (existing) Object.assign(existing, row);
    else state.units.push(Object.assign({ id: crypto.randomUUID(), createdAt: new Date().toISOString() }, row));
    const saved = existing || state.units[state.units.length - 1];
    if (!(cloud && cloud.live)) markPendingUnit(saved.id);
    n++;
  });
  log("Imported CSV (" + n + " rows)");
}
function resetDemo() {
  if (!confirm("Replace local data with the demo consignment?")) return;
  state.units = demoUnits();
  state.pars = demoPars();
  state.events = [{ id: crypto.randomUUID(), at: new Date().toISOString(), text: "Demo consignment reloaded" }];
  save(); refresh(); toast("Demo loaded");
}
function wipeAll() {
  if (!confirm("Erase every unit on this phone?")) return;
  state.units = []; state.events = [{ at: new Date().toISOString(), text: "Local stock cleared" }]; save(); refresh();
}
function showScreen(id) {
  document.querySelectorAll(".screen").forEach(s => s.classList.toggle("active", s.id === "screen-" + id));
  document.querySelectorAll(".nav button").forEach(b => b.classList.toggle("active", b.dataset.screen === id));
  if (id !== "scan" && typeof window.stopCamera === "function") window.stopCamera();
  if (id === "home") renderHome();
  if (id === "find") renderFind();
  if (id === "scan") renderRecentHospitals();
  if (id === "hospitals") renderHospitals();
  if (id === "team" && typeof setLiveUi === "function") setLiveUi();
  if (id === "team" && typeof renderAccess === "function") renderAccess();
}
function showModal(html) { document.getElementById("modal-body").innerHTML = html; document.getElementById("modal").classList.add("on"); }
function closeModal() { document.getElementById("modal").classList.remove("on"); }
function fillFamilySelect() {
  const sel = document.getElementById("find-family");
  if (!sel) return;
  const current = sel.value;
  const names = MATRIX_FAMILIES.map((group) => group.family);
  if (state.catalog.some((item) => item.family === "Accessory")) names.push("Accessory");
  sel.innerHTML = `<option value="">Any</option>` + names.map((name) => `<option value="${esc(name)}">${esc(name)}</option>`).join("");
  if ([...sel.options].some((option) => option.value === current)) sel.value = current;
}
function fillRegionSelect() {
  const sel = document.getElementById("hosp-region");
  if (!sel) return;
  const current = state.settings.hospRegion || sel.value;
  const regions = [...new Set(state.hospitals.map((hospital) => hospital.region).filter(Boolean))].sort();
  sel.innerHTML = `<option value="">All regions</option>` + regions.map((region) => `<option value="${esc(region)}">${esc(region)}</option>`).join("");
  if ([...sel.options].some((option) => option.value === current)) sel.value = current;
}
function renderRecentHospitals() {
  const el = document.getElementById("recent-hosp");
  const select = document.getElementById("scan-hosp");
  if (!el || !select) return;
  const selected = select.value;
  const ids = (state.settings.recentHospitals && state.settings.recentHospitals.length) ? state.settings.recentHospitals : (state.settings.lastHospital ? [state.settings.lastHospital] : []);
  el.innerHTML = ids.map((id) => `<button type="button" class="chip-btn${id === selected ? " on" : ""}" data-recent-hosp="${esc(id)}">${esc(shortSite(hospitalOf(id)))}</button>`).join("");
}
function fillSelects() {
  document.getElementById("scan-sku").innerHTML = skuOptions(state.settings.lastSku || "CDS0802-XTW");
  document.getElementById("scan-hosp").innerHTML = hospOptions(state.settings.lastHospital);
  document.getElementById("who").value = state.settings.specialist || "";
  fillFamilySelect();
  fillRegionSelect();
  renderRecentHospitals();
  const cfg = typeof loadFbConfig === "function" ? loadFbConfig() : null;
  if (cfg && document.getElementById("fb-json")) document.getElementById("fb-json").value = JSON.stringify(cfg, null, 2);
}
function refresh() {
  document.getElementById("who-label").textContent = state.settings.specialist || "UK TEER team";
  renderHome(); renderFind(); renderHospitals(); renderRecentHospitals();
  if (typeof setLiveUi === "function") setLiveUi();
}
function onBoardClick(e) {
  const cell = e.target.closest("[data-matrix-cell]");
  if (cell) {
    const hospitalId = cell.getAttribute("data-h");
    const family = cell.getAttribute("data-f");
    const size = cell.getAttribute("data-s");
    const have = countInStock(state.units, hospitalId, family, size, catalogOf);
    const par = parAmount(state.pars, hospitalId, family, size);
    if (par && have < par) openShortage(hospitalId, family, size);
    else openShelf(hospitalId, family, size);
    return;
  }
  const alertBtn = e.target.closest("[data-alert]");
  if (alertBtn) {
    const kind = alertBtn.getAttribute("data-alert");
    if (kind === "shortage") openShortage(alertBtn.getAttribute("data-h"), alertBtn.getAttribute("data-f"), alertBtn.getAttribute("data-s"));
    else if (kind === "guide") openGuideGap(alertBtn.getAttribute("data-h"), alertBtn.getAttribute("data-f"));
    else if (kind === "unit") openUnit(alertBtn.getAttribute("data-unit"));
    else if (kind === "all-short") openAllShortages();
    return;
  }
  const shelf = e.target.closest("[data-open-shelf]");
  if (shelf) {
    openShelf(shelf.getAttribute("data-h"), shelf.getAttribute("data-f"), shelf.getAttribute("data-s"));
    return;
  }
  const hospitalBtn = e.target.closest("[data-open-hospital]");
  if (hospitalBtn) {
    openHospital(hospitalBtn.getAttribute("data-open-hospital"));
    return;
  }
  const recent = e.target.closest("[data-recent-hosp]");
  if (recent) {
    const id = recent.getAttribute("data-recent-hosp");
    const select = document.getElementById("scan-hosp");
    if (select) select.value = id;
    rememberHospital(id);
    save();
    renderRecentHospitals();
    return;
  }
  const pick = e.target.closest("[data-pick-hosp]");
  if (pick) {
    const select = document.getElementById("xfer-to");
    if (select) select.value = pick.getAttribute("data-pick-hosp");
    document.querySelectorAll("[data-pick-hosp]").forEach((button) => button.classList.toggle("on", button === pick));
    return;
  }
  const kpi = e.target.closest("[data-kpi]");
  if (kpi) {
    jumpKpi(kpi.getAttribute("data-kpi"));
    return;
  }
  const quick = e.target.closest("[data-quick-size]");
  if (quick) {
    applyFind({ q: "", size: quick.getAttribute("data-quick-size"), family: "", status: "in-stock", expiry: "", sort: "hospital" });
    return;
  }
  const familyChip = e.target.closest("[data-find-family]");
  if (familyChip) {
    const select = document.getElementById("find-family");
    if (select) select.value = familyChip.getAttribute("data-find-family") || "";
    renderFind();
    return;
  }
  const family = e.target.closest("[data-matrix-family]");
  if (family) {
    state.settings.matrixFamily = family.getAttribute("data-matrix-family");
    save();
    renderHome();
    return;
  }
  const hospFilter = e.target.closest("[data-hosp-filter]");
  if (hospFilter) {
    state.settings.hospFilter = hospFilter.getAttribute("data-hosp-filter");
    save();
    renderHospitals();
  }
}
function bind() {
  document.querySelectorAll(".nav button").forEach(b => b.addEventListener("click", () => showScreen(b.dataset.screen)));
  document.getElementById("find-q").addEventListener("input", renderFind);
  document.getElementById("find-size").addEventListener("change", renderFind);
  document.getElementById("find-family").addEventListener("change", renderFind);
  document.getElementById("find-expiry").addEventListener("change", renderFind);
  document.getElementById("find-sort").addEventListener("change", renderFind);
  document.getElementById("find-status").addEventListener("change", renderFind);
  document.getElementById("find-clear").addEventListener("click", () => applyFind({ q: "", size: "", family: "", status: "in-stock", expiry: "", sort: "hospital" }));
  document.getElementById("hosp-q").addEventListener("input", renderHospitals);
  document.getElementById("hosp-region").addEventListener("change", () => {
    state.settings.hospRegion = document.getElementById("hosp-region").value;
    save();
    renderHospitals();
  });
  document.addEventListener("click", onBoardClick);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeModal(); });
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
  document.getElementById("scan-hosp").addEventListener("change", () => { rememberHospital(document.getElementById("scan-hosp").value); save(); renderRecentHospitals(); });
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
  if (earlier) earlier.addEventListener("click", () => {
    if (state.events.length > activityShown) {
      activityShown += 24;
      renderHome();
      return;
    }
    if (typeof loadEarlierEvents === "function") loadEarlierEvents();
  });
  const reorderCsv = document.getElementById("btn-reorder-csv");
  if (reorderCsv) reorderCsv.addEventListener("click", exportReorder);
  const reorderShare = document.getElementById("btn-reorder-share");
  if (reorderShare) reorderShare.addEventListener("click", shareReorder);
}
load(); fillSelects(); bind(); refresh(); initCloud();
if ("serviceWorker" in navigator) navigator.serviceWorker.register("./sw.js");
