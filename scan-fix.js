/* Overrides scanner from app.js — ZXing reads Abbott Code 128 on iPhone */
const GTIN_TO_SKU = {
  "05415067050854": "CDS0802-NTW",
  "05415067050878": "CDS0802-NT",
  "05415067105078": "CDS0602-NT"
};
let zxingReader = null;

function yymmdd(s) {
  if (!s || !/^\d{6}$/.test(s)) return "";
  return "20" + s.slice(0, 2) + "-" + s.slice(2, 4) + "-" + s.slice(4, 6);
}
function skuFromText(raw) {
  const u = (raw || "").toUpperCase();
  const m = u.match(/(CDS|SGC|MC)\d{4}(?:-(NTW|XTW|NT|XT))?/);
  if (!m) return "";
  const hit = state.catalog.find(c => c.sku === m[0]);
  return hit ? hit.sku : m[0];
}
function skuFromGtin(gtin) {
  if (!gtin) return "";
  const g = String(gtin).replace(/\D/g, "");
  const g14 = g.padStart(14, "0").slice(-14);
  return GTIN_TO_SKU[g14] || GTIN_TO_SKU[g] || "";
}
function parseGs1Concat(s) {
  const t = (s || "").replace(/[\u001d\x1d]/g, "").replace(/\s+/g, "").toUpperCase();
  const out = { gtin: "", expiry: "", lot: "", serial: "" };
  const g = t.match(/01(\d{14})/);
  if (g) out.gtin = g[1];
  const bundle = t.match(/17(\d{6})10(.+)(?:21|91)([A-Z0-9\-]{3,16})$/);
  if (bundle) {
    out.expiry = yymmdd(bundle[1]);
    out.lot = bundle[2];
    out.serial = bundle[3];
    return out;
  }
  const e = t.match(/17(\d{6})/);
  if (e) out.expiry = yymmdd(e[1]);
  return out;
}
function parseUDI(text) {
  const raw = (text || "").trim();
  const out = { serial: "", sku: "", expiry: "", lot: "", gtin: "", raw };
  const compact = raw.replace(/\s+/g, "");
  const hriRe = /\((\d{2})\)([^\(]+)/g;
  let hm;
  while ((hm = hriRe.exec(compact))) {
    const ai = hm[1];
    const val = hm[2].replace(/[^A-Za-z0-9\-]/g, "");
    if (ai === "01") out.gtin = val.padStart(14, "0").slice(-14);
    if (ai === "17") out.expiry = yymmdd(val);
    if (ai === "10") out.lot = val;
    if (ai === "21" || ai === "91") out.serial = val;
  }
  const c = parseGs1Concat(raw);
  if (!out.gtin && c.gtin) out.gtin = c.gtin;
  if (!out.expiry && c.expiry) out.expiry = c.expiry;
  if (!out.lot && c.lot) out.lot = c.lot;
  if (!out.serial && c.serial) out.serial = c.serial;
  out.sku = skuFromText(raw) || skuFromGtin(out.gtin);
  if (out.gtin && out.serial && out.serial.length >= 13) out.serial = "";
  return out;
}
function scanComplete() {
  return !!(document.getElementById("scan-sn").value.trim() && document.getElementById("scan-lot").value.trim());
}
function fillScanFrom(text) {
  const p = parseUDI(text);
  if (p.serial) document.getElementById("scan-sn").value = p.serial;
  if (p.sku) {
    const sel = document.getElementById("scan-sku");
    if (![...sel.options].some(o => o.value === p.sku)) {
      const opt = document.createElement("option");
      opt.value = p.sku; opt.textContent = p.sku;
      sel.appendChild(opt);
    }
    sel.value = p.sku;
  }
  if (p.expiry) document.getElementById("scan-exp").value = p.expiry;
  if (p.lot) document.getElementById("scan-lot").value = p.lot;
  const rawEl = document.getElementById("scan-raw");
  rawEl.textContent = [rawEl.textContent, p.raw].filter(Boolean).join(" | ");
  if (p.gtin && p.sku) GTIN_TO_SKU[p.gtin] = p.sku;
  return p;
}
const seenCodes = new Set();
function onCode(txt) {
  if (!txt || seenCodes.has(txt)) return false;
  seenCodes.add(txt);
  fillScanFrom(txt);
  if (scanComplete()) {
    toast("Filled from barcode");
    stopCamera();
    return true;
  }
  toast("Got a code — hold on the same barcode");
  return false;
}
function ensureVideo() {
  const box = document.getElementById("reader");
  box.style.display = "block";
  let video = document.getElementById("native-video");
  if (!video) {
    video = document.createElement("video");
    video.id = "native-video";
    video.setAttribute("playsinline", "true");
    video.setAttribute("autoplay", "true");
    video.setAttribute("muted", "true");
    video.style.width = "100%";
    box.innerHTML = "";
    box.appendChild(video);
  }
  return video;
}
async function startCamera() {
  seenCodes.clear();
  const video = ensureVideo();
  toast("Hold still on the barcode under LOT");
  if (window.ZXing && ZXing.BrowserMultiFormatReader) {
    try {
      if (zxingReader) { try { zxingReader.reset(); } catch (_) {} }
      zxingReader = new ZXing.BrowserMultiFormatReader();
      await zxingReader.decodeFromVideoDevice(undefined, video, (result) => {
        if (result) onCode(result.getText());
      });
      return;
    } catch (e) { console.warn(e); }
  }
  if ("BarcodeDetector" in window) {
    try {
      const det = new BarcodeDetector({ formats: ["code_128", "data_matrix", "qr_code", "ean_13", "code_39"] });
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } } });
      video.srcObject = stream;
      await video.play();
      const tick = async () => {
        if (!video.srcObject) return;
        try {
          const codes = await det.detect(video);
          for (const code of codes) { if (onCode(code.rawValue)) return; }
        } catch (_) {}
        requestAnimationFrame(tick);
      };
      tick();
      return;
    } catch (e) { console.warn(e); }
  }
  if (!window.Html5Qrcode) { toast("Type REF, lot and the (91) number from the yellow strip"); return; }
  html5Qr = new Html5Qrcode("reader");
  try {
    await html5Qr.start({ facingMode: "environment" }, { fps: 12, qrbox: { width: 280, height: 120 } }, (txt) => onCode(txt));
  } catch (e) {
    toast("Camera blocked. Use Read barcode from photo instead");
  }
}
async function stopCamera() {
  if (zxingReader) {
    try { zxingReader.reset(); } catch (_) {}
    zxingReader = null;
  }
  const video = document.getElementById("native-video");
  if (video && video.srcObject) {
    video.srcObject.getTracks().forEach(t => t.stop());
    video.srcObject = null;
  }
  if (typeof html5Qr !== "undefined" && html5Qr) {
    try { await html5Qr.stop(); } catch (_) {}
    html5Qr = null;
  }
}
async function readPhotoFile(file) {
  if (!file) return;
  seenCodes.clear();
  toast("Reading photo…");
  const url = URL.createObjectURL(file);
  try {
    if (window.ZXing && ZXing.BrowserMultiFormatReader) {
      const reader = new ZXing.BrowserMultiFormatReader();
      const result = await reader.decodeFromImageUrl(url);
      if (result) {
        fillScanFrom(result.getText());
        if (scanComplete()) { toast("Filled from photo"); URL.revokeObjectURL(url); return; }
      }
    }
  } catch (e) { console.warn(e); }
  URL.revokeObjectURL(url);
  if (window.Html5Qrcode) {
    try {
      let holder = document.getElementById("photo-reader-hidden");
      if (!holder) {
        holder = document.createElement("div");
        holder.id = "photo-reader-hidden";
        holder.style.display = "none";
        document.body.appendChild(holder);
      }
      const qr = new Html5Qrcode("photo-reader-hidden");
      const txt = await qr.scanFile(file, true);
      fillScanFrom(txt);
      try { await qr.clear(); } catch (_) {}
      if (scanComplete()) { toast("Filled from photo"); return; }
    } catch (e) { console.warn(e); }
  }
  toast("Could not read that photo. Take a closer shot of the barcode only");
}
(function rebindPhoto() {
  const old = document.getElementById("scan-photo");
  if (!old) return;
  const neu = old.cloneNode(true);
  old.parentNode.replaceChild(neu, old);
  neu.addEventListener("change", (e) => readPhotoFile(e.target.files[0]));
})();
