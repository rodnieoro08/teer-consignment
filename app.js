const KEY = "teer-consign-v1";
const SIZES = ["NT", "NTW", "XT", "XTW", "SGC"];
const state = {
  hospitals: HOSPITALS,
  catalog: CATALOG,
  units: [],
  events: [],
  settings: { specialist: "", team: "UK TEER", cloudUrl: "", lastHospital: "barts" }
};
function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) {
      state.units = demoUnits();
      state.events = [{ at: new Date().toISOString(), text: "Demo consignment loaded. Replace with your real serials." }];
      save();
      return;
    }
    const d = JSON.parse(raw);
    state.units = d.units || [];
    state.events = d.events || [];
    state.settings = Object.assign(state.settings, d.settings || {});
    if (d.hospitalsExtra) {
      d.hospitalsExtra.forEach(h => {
        if (!state.hospitals.find(x => x.id === h.id)) state.hospitals.push(h);
      });
    }
  } catch (e) {
    state.units = demoUnits();
  }
}
function save() {
  if (typeof saveLocalOnly === "function") saveLocalOnly();
  else localStorage.setItem(KEY, JSON.stringify({ units: state.units, events: state.events.slice(0, 300), settings: state.settings, hospitalsExtra: state.hospitals.filter(h => h.custom) }));
}
async function saveUnitCloud(u) {
  save();
  if (typeof cloudUpsert === "function") { try { await cloudUpsert("units", u.id, u); } catch (e) { toast(e.message); } }
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
async function log(text) {
  const ev = { id: crypto.randomUUID(), at: new Date().toISOString(), text, by: (state.settings.specialist || "") };
  state.events.unshift(ev);
  save();
  if (typeof cloudUpsert === "function") { try { await cloudUpsert("events", ev.id, ev); } catch (_) {} }
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
  const rows = state.hospitals.map(h => {
    const c = countsByHospital(h.id);
    if (!c.total) return "";
    return `<tr><td>${h.name}<div class="tiny">${h.city}</div></td>${SIZES.map(s => `<td class="${c[s] ? "okn" : "zero"}">${c[s]}</td>`).join("")}</tr>`;
  }).join("");
  document.getElementById("matrix-body").innerHTML = rows || `<tr><td colspan="6" class="empty">No stock yet</td></tr>`;
  const alerts = [];
  state.hospitals.forEach(h => {
    const c = countsByHospital(h.id);
    if (!c.total) return;
    if (!c.XTW) alerts.push(h.name + " has no XTW");
    if (!c.SGC) alerts.push(h.name + " has no SGC");
  });
  exp30.forEach(u => alerts.push(catalogOf(u.sku).size + " " + u.serial + " at " + hospitalOf(u.hospitalId).name + " expires " + u.expiry));
  document.getElementById("alerts").innerHTML = alerts.slice(0, 8).map(a => `<div class="flag-line">${a}</div>`).join("") || `<div class="empty">No gaps flagged</div>`;
  document.getElementById("activity").innerHTML = state.events.slice(0, 8).map(e => `<div class="row"><div><div class="t">${e.text}</div><div class="m">${new Date(e.at).toLocaleString("en-GB")}${e.by ? " · " + e.by : ""}</div></div></div>`).join("") || `<div class="empty">No activity yet</div>`;
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
    return [u.serial, u.sku, u.lot, c.label, c.size, h.name, h.city, h.region].join(" ").toLowerCase().includes(q);
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
  return `<button class="list-btn" onclick="openUnit('${u.id}')"><div class="row"><div><div class="t">${u.serial}</div><div class="m">${c.sku} · ${c.label}</div><span class="chip ${chipClass(c.size)}">${c.size}</span><span class="chip ${u.status === "in-stock" ? "in" : u.status === "used" ? "used" : "xfer"}">${u.status}</span></div><div class="r">${h.name}<div>${expNote}</div></div></div></button>`;
}
function renderHospitals() {
  const q = (document.getElementById("hosp-q").value || "").trim().toLowerCase();
  document.getElementById("hosp-list").innerHTML = state.hospitals.filter(h => !q || [h.name, h.city, h.region].join(" ").toLowerCase().includes(q)).map(h => {
    const c = countsByHospital(h.id);
    return `<div class="card hospital-card" onclick="openHospital('${h.id}')"><div class="row" style="padding-top:0"><div><div class="t">${h.name}</div><div class="m">${h.city} · ${h.region}</div>${SIZES.map(s => `<span class="chip ${chipClass(s)}">${s} ${c[s]}</span>`).join("")}</div><div class="r"><b>${c.total}</b><div>in stock</div></div></div></div>`;
  }).join("");
}
function skuOptions(selected) {
  return state.catalog.map(c => `<option value="${c.sku}" ${c.sku === selected ? "selected" : ""}>${c.sku} — ${c.label}</option>`).join("");
}
function hospOptions(selected) {
  return state.hospitals.map(h => `<option value="${h.id}" ${h.id === selected ? "selected" : ""}>${h.name}</option>`).join("");
}
function openHospital(id) {
  const h = hospitalOf(id);
  state.settings.lastHospital = id; save();
  const units = state.units.filter(u => u.hospitalId === id).sort((a, b) => a.status.localeCompare(b.status));
  showModal(`<h2>${h.name}</h2><p class="hint">${h.city} · ${h.region}</p><button class="primary" onclick="prepScan('${id}')">Scan into this hospital</button><div style="margin-top:12px">${units.map(unitCard).join("") || "<div class='empty'>No units recorded</div>"}</div><button class="secondary" onclick="closeModal()">Close</button>`);
}
function openUnit(id) {
  const u = state.units.find(x => x.id === id); if (!u) return;
  const c = catalogOf(u.sku);
  showModal(`<h2>${u.serial}</h2><p class="hint">${c.sku} · ${c.label}<br>${hospitalOf(u.hospitalId).name} · ${u.status}${u.updatedBy ? "<br>Last edit: " + u.updatedBy : ""}</p><div class="grid-2"><div class="field"><label>SKU</label><select id="u-sku">${skuOptions(u.sku)}</select></div><div class="field"><label>Hospital</label><select id="u-hosp">${hospOptions(u.hospitalId)}</select></div><div class="field"><label>Serial</label><input id="u-sn" value="${u.serial}"></div><div class="field"><label>Expiry</label><input id="u-exp" type="date" value="${u.expiry || ""}"></div><div class="field"><label>Status</label><select id="u-st"><option ${u.status==="in-stock"?"selected":""}>in-stock</option><option ${u.status==="used"?"selected":""}>used</option><option ${u.status==="in-transit"?"selected":""}>in-transit</option><option ${u.status==="quarantine"?"selected":""}>quarantine</option></select></div><div class="field"><label>Lot</label><input id="u-lot" value="${u.lot || ""}"></div><div class="field span2"><label>Notes</label><textarea id="u-notes">${u.notes || ""}</textarea></div></div><button class="primary" onclick="saveUnit('${u.id}')">Save</button><button class="secondary" onclick="markUsed('${u.id}')">Mark used in case</button><button class="secondary" onclick="startTransfer('${u.id}')">Borrow / transfer</button><button class="danger" onclick="deleteUnit('${u.id}')">Delete unit</button>`);
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
async function markUsed(id) {
  const u = state.units.find(x => x.id === id);
  u.status = "used"; u.updatedAt = new Date().toISOString();
  await saveUnitCloud(u);
  await log("Used " + u.serial + " (" + catalogOf(u.sku).size + ") at " + hospitalOf(u.hospitalId).name);
  closeModal(); refresh(); toast("Marked used");
}
async function deleteUnit(id) {
  const u = state.units.find(x => x.id === id);
  if (!confirm("Delete this unit from the shared list?")) return;
  state.units = state.units.filter(x => x.id !== id); save();
  if (typeof cloudDelete === "function") { try { await cloudDelete("units", id); } catch (e) { toast(e.message); } }
  await log("Deleted " + u.serial); closeModal(); refresh();
}
function startTransfer(id) {
  const u = state.units.find(x => x.id === id);
  showModal(`<h2>Transfer ${u.serial}</h2><p class="hint">Currently at ${hospitalOf(u.hospitalId).name}</p><div class="field"><label>Send to</label><select id="xfer-to">${hospOptions("")}</select></div><div class="field" style="margin-top:8px"><label>Reason</label><input id="xfer-why" placeholder="Case support / borrow"></div><button class="primary" onclick="doTransfer('${id}')">Move now</button><button class="secondary" onclick="openUnit('${id}')">Back</button>`);
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
  document.getElementById("scan-sn").value = ""; document.getElementById("scan-lot").value = ""; document.getElementById("scan-raw").textContent = ""; refresh();
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
  const rows = [["hospital","city","sku","size","serial","lot","expiry","status","notes"]];
  state.units.forEach(u => { const h = hospitalOf(u.hospitalId); const c = catalogOf(u.sku); rows.push([h.name, h.city, u.sku, c.size, u.serial, u.lot || "", u.expiry || "", u.status, (u.notes || "").replace(/,/g, ";")]); });
  download(new Blob([rows.map(r => r.map(x => '"' + x + '"').join(",")).join("\n")], { type: "text/csv" }), "teer-consignment-" + dateStamp() + ".csv");
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
        const bySn = new Map(state.units.map(u => [u.serial.toLowerCase(), u]));
        (d.units || []).forEach(u => {
          const key = (u.serial || "").toLowerCase(); if (!key) return;
          if (bySn.has(key)) Object.assign(bySn.get(key), u);
          else { u.id = u.id || crypto.randomUUID(); state.units.push(u); bySn.set(key, u); }
        });
        (d.hospitalsExtra || []).forEach(h => { if (!state.hospitals.find(x => x.id === h.id)) state.hospitals.push(h); });
        await log("Imported snapshot (" + d.units.length + " units)");
      }
      save(); if (cloud && cloud.live) await pushLocalUp(); fillSelects(); refresh(); toast("Imported");
    } catch (e) { toast("Could not import: " + e.message); }
  };
  reader.readAsText(file);
}
function importCSV(text) {
  const lines = text.split(/\r?\n/).filter(Boolean);
  const head = lines.shift().split(",").map(s => s.replace(/"/g, "").trim().toLowerCase());
  const idx = (n) => head.indexOf(n);
  let n = 0;
  lines.forEach(line => {
    const cols = line.split(",").map(s => s.replace(/^"|"$/g, "").trim());
    const serial = cols[idx("serial")] || cols[idx("sn")]; if (!serial) return;
    const hospName = cols[idx("hospital")] || "";
    const hosp = state.hospitals.find(h => h.name.toLowerCase() === hospName.toLowerCase()) || state.hospitals.find(h => hospName && h.city && hospName.toLowerCase().includes(h.city.toLowerCase()));
    const sku = cols[idx("sku")] || cols[idx("ref")] || "";
    const existing = state.units.find(u => u.serial.toLowerCase() === serial.toLowerCase());
    const row = { hospitalId: hosp ? hosp.id : state.settings.lastHospital, sku: sku || "CDS0802-XTW", serial, lot: cols[idx("lot")] || "", expiry: cols[idx("expiry")] || cols[idx("exp")] || "", status: (cols[idx("status")] || "in-stock").toLowerCase(), notes: cols[idx("notes")] || "", updatedAt: new Date().toISOString() };
    if (existing) Object.assign(existing, row); else state.units.push(Object.assign({ id: crypto.randomUUID(), createdAt: new Date().toISOString() }, row));
    n++;
  });
  log("Imported CSV (" + n + " rows)");
}
function resetDemo() {
  if (!confirm("Replace local data with the demo consignment?")) return;
  state.units = demoUnits(); state.events = [{ at: new Date().toISOString(), text: "Demo consignment reloaded" }]; save(); refresh(); toast("Demo loaded");
}
function wipeAll() {
  if (!confirm("Erase every unit on this phone?")) return;
  state.units = []; state.events = [{ at: new Date().toISOString(), text: "Local stock cleared" }]; save(); refresh();
}
function showScreen(id) {
  document.querySelectorAll(".screen").forEach(s => s.classList.toggle("active", s.id === "screen-" + id));
  document.querySelectorAll(".nav button").forEach(b => b.classList.toggle("active", b.dataset.screen === id));
  if (id !== "scan") stopCamera();
  if (id === "home") renderHome();
  if (id === "find") renderFind();
  if (id === "hospitals") renderHospitals();
  if (id === "team" && typeof setLiveUi === "function") setLiveUi();
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
  document.getElementById("btn-cam").addEventListener("click", startCamera);
  document.getElementById("btn-cam-stop").addEventListener("click", stopCamera);
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
}
load(); fillSelects(); bind(); refresh(); initCloud();
if ("serviceWorker" in navigator) navigator.serviceWorker.register("./sw.js");
