// Case-day flows built on top of the stock board: pinned sites, units in transit,
// usage, a scan screen that recognises what it scanned, and stock checks.
// Everything here stores data in fields the shared list already has, so
// firestore.rules does not need to change.

function byId(id) { return document.getElementById(id); }

async function shareText(title, text, fallback) {
  if (navigator.share) {
    try { await navigator.share({ title, text }); return; }
    catch (e) { if (e && e.name === "AbortError") return; }
  }
  if (navigator.clipboard && navigator.clipboard.writeText) {
    try { await navigator.clipboard.writeText(text); toast("Copied. Paste it into a message."); return; }
    catch (_) {}
  }
  if (typeof fallback === "function") fallback();
  else toast("Sharing is not available on this device");
}

function buzz() {
  try { if (navigator.vibrate) navigator.vibrate(40); } catch (_) {}
}

// ---------- Demo stock ----------

const DEMO_PAR_IDS = ["barts__mitraclip-g5__XTW", "barts__mitraclip-g5__NTW", "barts__triclip-g4__XTW", "papworth__triclip-g4__XTW"];

function demoCount() {
  return state.units.filter(isDemoUnit).length;
}

// Removes the example units and example par levels. Returns how many units went.
function dropDemo() {
  const demoIds = state.units.filter(isDemoUnit).map((unit) => unit.id);
  if (demoIds.length) {
    state.units = state.units.filter((unit) => !isDemoUnit(unit));
    if (state.sync) state.sync.pendingUnitIds = (state.sync.pendingUnitIds || []).filter((id) => demoIds.indexOf(id) === -1);
  }
  const before = state.pars.length;
  state.pars = state.pars.filter((par) => !(par.demo === true || (demoIds.length && DEMO_PAR_IDS.indexOf(par.id) !== -1 && !par.updatedAt)));
  if (state.sync && before !== state.pars.length) {
    const kept = new Set(state.pars.map((par) => par.id));
    state.sync.pendingParIds = (state.sync.pendingParIds || []).filter((id) => kept.has(id));
  }
  return demoIds.length;
}

function clearDemo() {
  if (!confirm("Remove the example stock from this phone? Units you added yourself are kept.")) return;
  const removed = dropDemo();
  state.events = state.events.filter((event) => !/^Demo consignment/.test(String(event.text || "")));
  save();
  refresh();
  toast(removed + " example units removed. Scan a box to start your list.");
}

function renderDemoBanner() {
  const el = byId("demo-banner");
  if (!el) return;
  const n = demoCount();
  if (!n) { el.style.display = "none"; el.innerHTML = ""; return; }
  el.style.display = "block";
  el.innerHTML = `<h2>Example stock</h2><p class="hint">${n} of the units below are made-up examples so you can try the app. They are never uploaded to the shared list, and they are removed when you sign in.</p><button class="secondary" type="button" data-flow="clear-demo" style="margin-top:0">Remove the examples and start my list</button>`;
}

// ---------- My sites ----------

function pinnedIds() {
  return (state.settings.pinned || []).filter((id) => state.hospitals.some((hospital) => hospital.id === id));
}

function isPinned(id) {
  return pinnedIds().indexOf(id) !== -1;
}

function togglePin(id) {
  const list = pinnedIds();
  state.settings.pinned = isPinned(id) ? list.filter((item) => item !== id) : list.concat([id]);
  save();
  renderHome();
  openHospital(id);
  toast(isPinned(id) ? "Pinned to Home" : "Removed from Home");
}

function siteSummary(hospitalId) {
  const now = new Date();
  const lines = MATRIX_FAMILIES.map((group) => {
    const cells = group.sizes.map((size) => ({
      size,
      have: countInStock(state.units, hospitalId, group.family, size, catalogOf, now),
      par: parAmount(state.pars, hospitalId, group.family, size)
    }));
    if (!cells.some((cell) => cell.have || cell.par)) return null;
    return { family: group.family, cells };
  }).filter(Boolean);
  const mine = state.units.filter((unit) => unit.hospitalId === hospitalId);
  const usable = mine.filter((unit) => unitUsable(unit, now));
  return {
    lines,
    usable: usable.length,
    expired: mine.filter((unit) => inStock(unit) && unitExpired(unit, now)).length,
    inbound: mine.filter((unit) => unit.status === "in-transit").length,
    soon: usable.filter((unit) => daysTo(unit.expiry) <= 30).length
  };
}

function kitHtml(summary) {
  if (!summary.lines.length) return `<div class="tiny">Nothing ready to use on this shelf.</div>`;
  return summary.lines.map((line) => {
    return `<div class="kit-line"><span class="kit-fam">${esc(matrixChipLabel(line.family))}</span>${line.cells.map((cell) => `<span class="kit-cell ${cellTone(cell.have, cell.par)}">${esc(cell.size === "SGC" ? "Guide" : cell.size)} <b>${cell.have}</b></span>`).join("")}</div>`;
  }).join("");
}

function siteChips(hospitalId, summary, board) {
  const short = board.deficits.filter((line) => line.hospitalId === hospitalId).length;
  const guide = board.guideGaps.some((gap) => gap.hospitalId === hospitalId);
  const chips = [];
  if (short) chips.push(`<span class="chip used">${short} below par</span>`);
  if (guide) chips.push(`<span class="chip xtw">Needs a guide</span>`);
  if (summary.expired) chips.push(`<span class="chip used">${summary.expired} expired</span>`);
  if (summary.soon) chips.push(`<span class="chip xfer">${summary.soon} within 30 days</span>`);
  if (summary.inbound) chips.push(`<span class="chip sgc">${summary.inbound} on the way</span>`);
  return chips.join("");
}

function renderMySites() {
  const el = byId("my-sites");
  if (!el) return;
  const ids = pinnedIds();
  if (!ids.length) {
    el.innerHTML = `<p class="hint" style="margin:0">Pin the hospitals you cover and their shelves show here first. Open a hospital in Sites and tap Pin to Home.</p>`;
    return;
  }
  const board = shortageBoard(state.hospitals, state.units, state.pars, catalogOf);
  el.innerHTML = ids.map((id) => {
    const hospital = hospitalOf(id);
    const summary = siteSummary(id);
    const chips = siteChips(id, summary, board);
    return `<button type="button" class="site-btn" data-open-hospital="${esc(id)}"><div class="site-top"><b>${esc(shortSite(hospital))}</b><span class="tiny">${summary.usable} ready to use</span></div>${kitHtml(summary)}${chips ? `<div>${chips}</div>` : ""}</button>`;
  }).join("");
}

function hospitalStockText(hospitalId) {
  const hospital = hospitalOf(hospitalId);
  const now = new Date();
  const units = state.units.filter((unit) => unit.hospitalId === hospitalId && inStock(unit))
    .sort((a, b) => daysTo(a.expiry) - daysTo(b.expiry));
  const lines = ["TEER consignment · " + hospital.name, formatDate(todayStr(now)) + " · " + units.length + " on the shelf"];
  siteSummary(hospitalId).lines.forEach((line) => {
    lines.push(line.family + ": " + line.cells.map((cell) => (cell.size === "SGC" ? "Guide" : cell.size) + " " + cell.have).join(", "));
  });
  lines.push("");
  units.forEach((unit) => {
    const item = catalogOf(unit.sku);
    const expiry = !unit.expiry ? "no expiry recorded" : unitExpired(unit, now) ? "EXPIRED " + formatDate(unit.expiry) : "exp " + formatDate(unit.expiry);
    lines.push("- " + [item.family, item.size].filter(Boolean).join(" ") + " · REF " + unit.sku + " · SN " + unit.serial + (unit.lot ? " · lot " + unit.lot : "") + " · " + expiry);
  });
  if (!units.length) lines.push("Nothing recorded on this shelf.");
  return lines.join("\n");
}

function shareHospitalStock(hospitalId) {
  shareText("TEER consignment · " + hospitalOf(hospitalId).name, hospitalStockText(hospitalId));
}

// ---------- In transit ----------

function renderTransit() {
  const card = byId("transit-card");
  const list = byId("transit-list");
  if (!card || !list) return;
  const units = state.units.filter((unit) => unit.status === "in-transit");
  card.style.display = units.length ? "block" : "none";
  list.innerHTML = units.map((unit) => {
    const item = catalogOf(unit.sku);
    const from = transitFrom(unit);
    return `<button type="button" class="flag-btn" data-alert="unit" data-unit="${esc(unit.id)}"><b>${esc(item.family)} ${esc(item.size)}</b> · ${esc(unit.serial)}<div class="tiny">${from ? esc(from) + " → " : "To "}${esc(hospitalOf(unit.hospitalId).name)} · tap when it arrives</div></button>`;
  }).join("");
}

async function receiveUnit(id) {
  const unit = state.units.find((item) => item.id === id);
  if (!unit) return;
  await setStatus(id, "in-stock", "Received " + unit.serial + " at " + hospitalOf(unit.hospitalId).name, "Received at " + shortSite(hospitalOf(unit.hospitalId)));
}

async function quarantineUnit(id) {
  const unit = state.units.find((item) => item.id === id);
  if (!unit) return;
  await setStatus(id, "quarantine", "Quarantined " + unit.serial + " at " + hospitalOf(unit.hospitalId).name, "Moved to quarantine");
}

// ---------- Usage ----------

function renderUsageCard() {
  const el = byId("usage-summary");
  if (!el) return;
  const rows = usageRows(state.units, daysAgoStr(30));
  if (!rows.length) {
    el.textContent = "Nothing marked used in the last 30 days.";
    return;
  }
  const bySite = new Map();
  rows.forEach((unit) => bySite.set(unit.hospitalId, (bySite.get(unit.hospitalId) || 0) + 1));
  const sites = Array.from(bySite.entries()).sort((a, b) => b[1] - a[1]).slice(0, 4)
    .map(([id, n]) => shortSite(hospitalOf(id)) + " " + n).join(" · ");
  el.textContent = rows.length + " used in the last 30 days · " + sites;
}

function usageTitle(days) {
  return "TEER usage · " + formatDate(daysAgoStr(days)) + " to " + formatDate(todayStr());
}

function openUsage(days) {
  const span = [7, 30, 90].indexOf(days) === -1 ? 30 : days;
  const rows = usageRows(state.units, daysAgoStr(span));
  const chips = [7, 30, 90].map((n) => `<button type="button" class="chip-btn${n === span ? " on" : ""}" data-flow="usage-days" data-days="${n}">${n} days</button>`).join("");
  const groups = groupByHospital(rows, hospitalOf).sort((a, b) => a.name.localeCompare(b.name));
  const body = groups.map((group) => {
    return `<h3 class="matrix-family">${esc(group.name)} · ${group.units.length}</h3>${group.units.map((unit) => unitCard(unit, { place: false, when: "Used " + formatDate(usedDate(unit)) })).join("")}`;
  }).join("") || `<div class="empty">Nothing marked used in the last ${span} days.</div>`;
  showModal(`<h2>Used in cases</h2><p class="hint">What has left the shelves, for replacement orders and paperwork. ${rows.length} unit${rows.length === 1 ? "" : "s"} in the last ${span} days.</p><div class="chip-row" style="margin-bottom:8px">${chips}</div>${body}<div class="btn-row"><button class="secondary" type="button" data-flow="usage-share" data-days="${span}">Share list</button><button class="secondary" type="button" data-flow="usage-csv" data-days="${span}">Export CSV</button></div>`);
}

function exportUsage(days) {
  const rows = [["used on", "hospital", "family", "size", "REF", "serial", "lot", "expiry", "notes"]];
  usageRows(state.units, daysAgoStr(days)).forEach((unit) => {
    const item = catalogOf(unit.sku);
    rows.push([usedDate(unit), hospitalOf(unit.hospitalId).name, item.family, item.size, unit.sku, unit.serial, unit.lot || "", unit.expiry || "", unit.notes || ""]);
  });
  download(new Blob([toCsv(rows)], { type: "text/csv" }), "teer-usage-" + dateStamp() + ".csv");
}

function shareUsage(days) {
  const text = usageText(usageRows(state.units, daysAgoStr(days)), { catalogOf, hospitalOf }, usageTitle(days));
  shareText("TEER usage", text, () => exportUsage(days));
}

// ---------- Scan screen: recognise what was scanned ----------

let scanSession = [];
let lastScan = { gtin: "", skuKnown: false };

function unitBySerial(serial) {
  const key = normSerial(serial);
  if (!key) return null;
  return state.units.find((unit) => normSerial(unit.serial) === key) || null;
}

function resetLastScan() {
  lastScan = { gtin: "", skuKnown: false };
}

function clearScanForm() {
  ["scan-sn", "scan-lot", "scan-exp", "scan-raw-in"].forEach((id) => { const el = byId(id); if (el) el.value = ""; });
  const raw = byId("scan-raw");
  if (raw) raw.textContent = "";
  if (typeof seenCodes !== "undefined" && seenCodes && seenCodes.clear) seenCodes.clear();
  resetLastScan();
  renderScanMatch();
}

// Called by the scanner every time a barcode has filled part of the form.
function onScanFilled(parsed) {
  const p = parsed || {};
  if (p.gtin) lastScan.gtin = String(p.gtin);
  if (p.sku) lastScan.skuKnown = true;
  if (checkActive()) {
    const serial = byId("scan-sn").value.trim();
    if (serial) {
      checkHandleSerial(serial, { sku: p.sku || (lastScan.skuKnown ? byId("scan-sku").value : ""), lot: byId("scan-lot").value.trim(), expiry: byId("scan-exp").value });
      ["scan-sn", "scan-lot", "scan-exp"].forEach((id) => { byId(id).value = ""; });
      byId("scan-raw").textContent = "";
      resetLastScan();
    }
    return;
  }
  renderScanMatch();
  // After a camera read the answer is below the fold on a phone, so bring it into view.
  const match = byId("scan-match");
  if (match && match.firstChild && match.scrollIntoView) match.scrollIntoView({ block: "center", behavior: "smooth" });
}

// A barcode this phone could not map to a REF is remembered once the unit is added,
// so the next box of the same product fills in its own REF.
function learnScannedRef(sku) {
  if (!lastScan.gtin || lastScan.skuKnown || !sku) return false;
  const gtin = lastScan.gtin.replace(/\D/g, "").padStart(14, "0").slice(-14);
  if (!state.settings.gtinMap) state.settings.gtinMap = {};
  state.settings.gtinMap[gtin] = sku;
  return true;
}

function forgetLearnedRefs() {
  const n = Object.keys(state.settings.gtinMap || {}).length;
  if (!n) { toast("No learned barcodes on this phone"); return; }
  if (!confirm("Forget " + n + " barcode" + (n === 1 ? "" : "s") + " this phone learned? You will pick the REF by hand the next time.")) return;
  state.settings.gtinMap = {};
  save();
  renderScanExtras();
  toast("Learned barcodes forgotten");
}

function pushSession(verb, unit) {
  scanSession.unshift({ verb, id: unit.id });
  scanSession = scanSession.slice(0, 30);
  renderScanSession();
}

function renderScanSession() {
  const el = byId("scan-session");
  if (!el) return;
  const rows = scanSession.map((entry) => {
    const unit = state.units.find((item) => item.id === entry.id);
    if (!unit) return "";
    const item = catalogOf(unit.sku);
    return `<button type="button" class="flag-btn" data-alert="unit" data-unit="${esc(unit.id)}"><b>${esc(entry.verb)}</b> · ${esc(item.family)} ${esc(item.size)} · ${esc(unit.serial)}<div class="tiny">${esc(hospitalOf(unit.hospitalId).name)}</div></button>`;
  }).filter(Boolean);
  el.innerHTML = rows.length ? `<h3 class="matrix-family">This session · ${rows.length}</h3>${rows.join("")}` : "";
}

function renderScanMatch() {
  const box = byId("scan-match");
  const button = byId("btn-add");
  if (!box || !button) return;
  const serial = byId("scan-sn").value.trim();
  const hospitalId = byId("scan-hosp").value;
  const site = shortSite(hospitalOf(hospitalId));
  const expiry = byId("scan-exp").value;
  const notes = [];
  if (lastScan.gtin && !lastScan.skuKnown) {
    notes.push(`<div class="note warn">This barcode did not say which product it is. Check SKU / REF above before you add it. The phone will remember it for the next box.</div>`);
  }
  const unit = unitBySerial(serial);
  if (!unit) {
    if (expiry && daysTo(expiry) < 0) notes.push(`<div class="note bad">This box expired on ${esc(formatDate(expiry))}. Do not put it on the shelf for use.</div>`);
    button.textContent = "Add to " + site;
    box.innerHTML = notes.join("");
    return;
  }
  const item = catalogOf(unit.sku);
  const here = unit.hospitalId === hospitalId;
  const exp = expiryNote(unit.expiry);
  const where = hospitalOf(unit.hospitalId).name;
  const actions = [];
  if (unit.status === "in-stock") {
    if (!unitExpired(unit)) actions.push(`<button class="primary" type="button" data-flow="scan-use" data-unit="${esc(unit.id)}">Mark used in case</button>`);
    else notes.push(`<div class="note bad">Expired. Do not use it in a case.</div>`);
    button.textContent = here ? "Update details" : "Move to " + site;
  } else if (unit.status === "in-transit") {
    button.textContent = "Mark received at " + site;
  } else {
    button.textContent = "Put back in stock at " + site;
  }
  actions.push(`<button class="secondary" type="button" data-alert="unit" data-unit="${esc(unit.id)}">Open this unit</button>`);
  box.innerHTML = `<div class="match"><div class="match-h">Already on the list</div><div class="t">${esc(item.family)} ${esc(item.size)} · ${esc(unit.serial)}</div><div class="m">${esc(where)} · ${esc(statusLabel(unit.status))} · <span class="${exp.cls}">${esc(exp.text)}</span></div>${notes.join("")}${actions.join("")}</div>`;
}

async function scanMarkUsed(id) {
  const unit = state.units.find((item) => item.id === id);
  if (!unit) return;
  await markUsed(id);
  pushSession("Used", unit);
  clearScanForm();
}

function renderScanExtras() {
  renderCheck();
  if (!checkActive()) renderScanMatch();
  renderScanSession();
  const forget = byId("btn-forget-gtin");
  if (forget) {
    const n = Object.keys(state.settings.gtinMap || {}).length;
    forget.style.display = n ? "block" : "none";
    forget.textContent = "Forget learned barcodes (" + n + ")";
  }
}

// ---------- Stock check ----------

function activeCheck() {
  const check = state.settings.check;
  return check && check.hospitalId ? check : null;
}

function checkActive() {
  return !!activeCheck();
}

function checkExpected(check) {
  return state.units.filter((unit) => unit.hospitalId === check.hospitalId && inStock(unit)).sort((a, b) => {
    const ia = catalogOf(a.sku);
    const ib = catalogOf(b.sku);
    return String(ia.family).localeCompare(String(ib.family)) || String(ia.size).localeCompare(String(ib.size)) || String(a.serial).localeCompare(String(b.serial));
  });
}

function startCheck(hospitalId) {
  const open = activeCheck();
  if (open && open.hospitalId !== hospitalId) {
    if (!confirm("A stock check at " + hospitalOf(open.hospitalId).name + " is still open. Drop it and start one at " + hospitalOf(hospitalId).name + "?")) return;
  }
  if (!open || open.hospitalId !== hospitalId) {
    state.settings.check = { hospitalId, startedAt: new Date().toISOString(), found: [], extras: [] };
  }
  save();
  closeModal();
  showScreen("scan");
  window.scrollTo(0, 0);
}

function checkTick(id, on) {
  const check = activeCheck();
  if (!check) return;
  check.found = check.found.filter((item) => item !== id);
  if (on) check.found.push(id);
  save();
  renderCheck();
}

function checkHandleSerial(serial, fields) {
  const check = activeCheck();
  const typed = String(serial || "").trim();
  if (!check || !typed) return;
  const unit = unitBySerial(typed);
  const expected = checkExpected(check);
  if (unit && expected.some((item) => item.id === unit.id)) {
    if (check.found.indexOf(unit.id) !== -1) { toast("Already ticked " + unit.serial); return; }
    check.found.push(unit.id);
    save();
    renderCheck();
    buzz();
    const done = expected.filter((item) => check.found.indexOf(item.id) !== -1).length;
    toast("Found " + catalogOf(unit.sku).size + " " + unit.serial + " · " + done + " of " + expected.length);
    return;
  }
  if (check.extras.some((extra) => normSerial(extra.serial) === normSerial(typed))) { toast("Already noted " + typed); return; }
  let note = "not on the list";
  if (unit && unit.hospitalId === check.hospitalId) note = "listed here as " + statusLabel(unit.status).toLowerCase();
  else if (unit) note = "listed at " + hospitalOf(unit.hospitalId).name + (unit.status !== "in-stock" ? " (" + statusLabel(unit.status).toLowerCase() + ")" : "");
  const data = fields || {};
  check.extras.push({ serial: unit ? unit.serial : typed, unitId: unit ? unit.id : "", note, sku: data.sku || "", lot: data.lot || "", expiry: data.expiry || "" });
  save();
  renderCheck();
  buzz();
  toast("Not expected here: " + typed + " · " + note);
}

function checkTypeSerial() {
  const input = byId("check-sn");
  if (!input || !input.value.trim()) { toast("Type a serial first"); return; }
  checkHandleSerial(input.value, {});
  const again = byId("check-sn");
  if (again) again.value = "";
}

function checkExtraBySerial(serial) {
  const check = activeCheck();
  if (!check) return null;
  return check.extras.find((extra) => normSerial(extra.serial) === normSerial(serial)) || null;
}

async function checkResolve(serial) {
  const check = activeCheck();
  const extra = checkExtraBySerial(serial);
  if (!check || !extra) return;
  const unit = extra.unitId ? state.units.find((item) => item.id === extra.unitId) : null;
  if (!unit) {
    showModal(`<h2>Add ${esc(extra.serial)}</h2><p class="hint">This serial is on the shelf at ${esc(hospitalOf(check.hospitalId).name)} but not on the list. Confirm what it is and it is added here.</p><div class="field"><label>SKU / REF</label><select id="extra-sku">${skuOptions(extra.sku || state.settings.lastSku || "CDS0802-XTW")}</select></div><div class="grid-2" style="margin-top:8px"><div class="field"><label>Lot</label><input id="extra-lot" value="${esc(extra.lot || "")}"></div><div class="field"><label>Expiry</label><input id="extra-exp" type="date" value="${esc(extra.expiry || "")}"></div></div><button class="primary" type="button" style="margin-top:12px" data-flow="check-add" data-serial="${esc(extra.serial)}">Add to this shelf</button>`);
    return;
  }
  const from = hospitalOf(unit.hospitalId).name;
  const moved = unit.hospitalId !== check.hospitalId;
  unit.hospitalId = check.hospitalId;
  unit.status = "in-stock";
  unit.notes = clearTransitStamp(clearUsedStamp(unit.notes));
  unit.updatedAt = new Date().toISOString();
  await saveUnitCloud(unit);
  await log((moved ? "Moved " + unit.serial + " " + from + " → " + hospitalOf(check.hospitalId).name : "Returned " + unit.serial + " to stock at " + hospitalOf(check.hospitalId).name) + " · found during stock check");
  check.extras = check.extras.filter((item) => item !== extra);
  if (check.found.indexOf(unit.id) === -1) check.found.push(unit.id);
  save();
  refresh();
  toast("On this shelf now");
}

async function checkAddExtra(serial) {
  const check = activeCheck();
  const extra = checkExtraBySerial(serial);
  if (!check || !extra) return;
  const sku = byId("extra-sku").value;
  const now = new Date().toISOString();
  const unit = { id: crypto.randomUUID(), hospitalId: check.hospitalId, sku, serial: extra.serial, lot: byId("extra-lot").value.trim(), expiry: byId("extra-exp").value, status: "in-stock", notes: "", createdAt: now, updatedAt: now };
  state.units.push(unit);
  await saveUnitCloud(unit);
  await log("Received " + unit.serial + " (" + catalogOf(sku).size + ") at " + hospitalOf(check.hospitalId).name + " · found during stock check");
  check.extras = check.extras.filter((item) => item !== extra);
  check.found.push(unit.id);
  save();
  closeModal();
  refresh();
  toast("Added to this shelf");
}

let lastCheckText = "";

async function finishCheck() {
  const check = activeCheck();
  if (!check) return;
  const hospital = hospitalOf(check.hospitalId);
  const expected = checkExpected(check);
  const report = checkReport({ hospitalName: hospital.name, expected, foundIds: check.found, extras: check.extras, date: todayStr() });
  if (report.missing.length && !confirm(report.missing.length + " unit" + (report.missing.length === 1 ? " has" : "s have") + " not been found. Finish the check anyway?")) return;
  state.settings.check = null;
  save();
  await log(report.log);
  lastCheckText = report.text;
  if (typeof window.stopCamera === "function") window.stopCamera();
  refresh();
  const missing = report.missing.length
    ? `<h3 class="matrix-family">Not found · ${report.missing.length}</h3><p class="hint">Still on the list as in stock. Open one to mark it used, transfer it or quarantine it.</p>${report.missing.map((unit) => unitCard(unit, { place: false })).join("")}`
    : "";
  const extras = report.extras.length
    ? `<h3 class="matrix-family">On the shelf but not expected · ${report.extras.length}</h3>${report.extras.map((extra) => `<div class="row"><div><div class="t">${esc(extra.serial)}</div><div class="m">${esc(extra.note)}</div></div></div>`).join("")}`
    : "";
  showModal(`<h2>Stock check done</h2><p class="hint">${esc(hospital.name)} · ${report.found.length} of ${expected.length} found${!report.missing.length && !report.extras.length ? ". The shelf matches the list." : ""}<br>The result is in the activity log for the team.</p>${missing}${extras}<button class="primary" type="button" style="margin-top:12px" data-flow="check-share">Share result</button>`);
}

function cancelCheck() {
  const check = activeCheck();
  if (!check) return;
  if ((check.found.length || check.extras.length) && !confirm("Drop this stock check? The ticks are lost and nothing is logged.")) return;
  state.settings.check = null;
  save();
  renderScanExtras();
  toast("Stock check dropped");
}

function checkRow(unit, found) {
  const item = catalogOf(unit.sku);
  const exp = expiryNote(unit.expiry);
  return `<button type="button" class="check-row${found ? " done" : ""}" data-flow="${found ? "check-untick" : "check-tick"}" data-unit="${esc(unit.id)}"><span class="tick" aria-hidden="true">${found ? "✓" : ""}</span><span class="check-main"><span class="t">${esc(unit.serial)}</span><span class="m">${esc(item.family)} · ${esc(unit.sku)}${unit.lot ? " · lot " + esc(unit.lot) : ""}</span></span><span class="r"><span class="chip ${chipClass(item.size)}">${esc(item.size)}</span><br><span class="${exp.cls}">${esc(exp.text)}</span></span></button>`;
}

function renderCheck() {
  const card = byId("check-card");
  const unitCardEl = byId("unit-card");
  if (!card) return;
  const check = activeCheck();
  if (!check) {
    card.style.display = "none";
    card.innerHTML = "";
    if (unitCardEl) unitCardEl.style.display = "block";
    return;
  }
  if (unitCardEl) unitCardEl.style.display = "none";
  card.style.display = "block";
  const hospital = hospitalOf(check.hospitalId);
  const expected = checkExpected(check);
  const found = expected.filter((unit) => check.found.indexOf(unit.id) !== -1);
  const todo = expected.filter((unit) => check.found.indexOf(unit.id) === -1);
  const pct = expected.length ? Math.round((found.length / expected.length) * 100) : 0;
  const typed = byId("check-sn") ? byId("check-sn").value : "";
  const extras = check.extras.map((extra) => {
    return `<div class="row"><div><div class="t">${esc(extra.serial)}</div><div class="m">${esc(extra.note)}</div></div><div class="r"><button type="button" class="chip-btn" data-flow="check-resolve" data-serial="${esc(extra.serial)}">${extra.unitId ? "Put on this shelf" : "Add to list"}</button></div></div>`;
  }).join("");
  card.innerHTML = `<h2>Stock check · ${esc(shortSite(hospital))}</h2><p class="hint">Scan every box on the shelf at ${esc(hospital.name)}. Each one is ticked off. You can also tap a line to tick it by eye.</p><div class="progress"><div class="bar" style="width:${pct}%"></div></div><div class="tiny" style="margin-top:4px">${found.length} of ${expected.length} found${check.extras.length ? " · " + check.extras.length + " not expected" : ""}</div><div class="field" style="margin-top:10px"><label for="check-sn">Serial, if the barcode will not read</label><div class="inline"><input id="check-sn" placeholder="Type a serial" autocapitalize="characters" autocomplete="off" enterkeyhint="done"><button class="secondary" type="button" data-flow="check-type">Tick</button></div></div>${check.extras.length ? `<h3 class="matrix-family">Not expected here · ${check.extras.length}</h3>${extras}` : ""}<h3 class="matrix-family">Still to find · ${todo.length}</h3>${todo.map((unit) => checkRow(unit, false)).join("") || `<div class="empty" style="padding:12px">${expected.length ? "Everything on the list has been found." : "The list has nothing in stock at this hospital."}</div>`}${found.length ? `<details class="find-more"${todo.length ? "" : " open"}><summary>Found · ${found.length}</summary>${found.map((unit) => checkRow(unit, true)).join("")}</details>` : ""}<button class="primary" type="button" style="margin-top:12px" data-flow="check-finish">Finish check</button><button class="secondary" type="button" data-flow="check-cancel">Drop this check</button>`;
  if (typed && byId("check-sn")) byId("check-sn").value = typed;
}

// ---------- Wiring ----------

function onFlowClick(e) {
  const el = e.target.closest("[data-flow]");
  if (!el) return;
  const kind = el.getAttribute("data-flow");
  const unitId = el.getAttribute("data-unit");
  const days = parseInt(el.getAttribute("data-days"), 10) || 30;
  const serial = el.getAttribute("data-serial");
  if (kind === "clear-demo") clearDemo();
  else if (kind === "usage-open") openUsage(30);
  else if (kind === "usage-days") openUsage(days);
  else if (kind === "usage-share") shareUsage(days);
  else if (kind === "usage-csv") exportUsage(days);
  else if (kind === "scan-use") scanMarkUsed(unitId);
  else if (kind === "check-tick") { checkTick(unitId, true); buzz(); }
  else if (kind === "check-untick") checkTick(unitId, false);
  else if (kind === "check-type") checkTypeSerial();
  else if (kind === "check-resolve") checkResolve(serial);
  else if (kind === "check-add") checkAddExtra(serial);
  else if (kind === "check-finish") finishCheck();
  else if (kind === "check-cancel") cancelCheck();
  else if (kind === "check-share") shareText("TEER stock check", lastCheckText);
  else if (kind === "start-check") startCheck(el.getAttribute("data-h"));
  else if (kind === "pin") togglePin(el.getAttribute("data-h"));
  else if (kind === "share-site") shareHospitalStock(el.getAttribute("data-h"));
  else if (kind === "forget-gtin") forgetLearnedRefs();
}

function bindFlows() {
  document.addEventListener("click", onFlowClick);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && e.target && e.target.id === "check-sn") { e.preventDefault(); checkTypeSerial(); }
  });
  ["scan-sn", "scan-exp"].forEach((id) => {
    const el = byId(id);
    if (el) el.addEventListener("input", renderScanMatch);
  });
  const hosp = byId("scan-hosp");
  if (hosp) hosp.addEventListener("change", renderScanMatch);
  const sku = byId("scan-sku");
  if (sku) sku.addEventListener("change", renderScanMatch);
}

function renderFlowsHome() {
  renderDemoBanner();
  renderMySites();
  renderTransit();
  renderUsageCard();
}
