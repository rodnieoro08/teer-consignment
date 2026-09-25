/* Overrides scanner behaviour from app.js */
const GTIN_TO_SKU = Object.assign({
  "05415067105078": "CDS0602-NT"
}, typeof GTIN_TO_SKU === "object" && GTIN_TO_SKU ? GTIN_TO_SKU : {});

function yymmdd(s) {
  if (!s || !/^\d{6}$/.test(s)) return "";
  return "20" + s.slice(0, 2) + "-" + s.slice(2, 4) + "-" + s.slice(4, 6);
}
function skuFromText(raw) {
  const u = (raw || "").toUpperCase();
  const m = u.match(/(CDS|SGC|MC)\d{4}(?:-(NTW|XTW|NT|XT))?/);
  if (!m) return "";
  const hit = state.catalog.find(c => c.sku === m[0]);
  return hit ? hit.sku : "";
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
  const bundle = t.match(/17(\d{6})10(.+)21([A-Z0-9\-]{3,16})$/);
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
    if (ai === "21") out.serial = val;
  }
  const c = parseGs1Concat(raw);
  if (!out.gtin && c.gtin) out.gtin = c.gtin;
  if (!out.expiry && c.expiry) out.expiry = c.expiry;
  if (!out.lot && c.lot) out.lot = c.lot;
  if (!out.serial && c.serial) out.serial = c.serial;
  out.sku = skuFromText(raw) || skuFromGtin(out.gtin);
  if (!out.sku) {
    const skuHit = state.catalog.find(x => compact.toUpperCase().includes(x.sku.toUpperCase()));
    if (skuHit) out.sku = skuHit.sku;
  }
  if (out.gtin && out.serial && out.serial.length >= 13) out.serial = "";
  return out;
}
function scanComplete() {
  const sn = document.getElementById("scan-sn").value.trim();
  const lot = document.getElementById("scan-lot").value.trim();
  return !!(sn && lot);
}
function fillScanFrom(text) {
  const p = parseUDI(text);
  if (p.serial) document.getElementById("scan-sn").value = p.serial;
  if (p.sku) document.getElementById("scan-sku").value = p.sku;
  if (p.expiry) document.getElementById("scan-exp").value = p.expiry;
  if (p.lot) document.getElementById("scan-lot").value = p.lot;
  const rawEl = document.getElementById("scan-raw");
  const prev = rawEl.textContent || "";
  rawEl.textContent = [prev, p.raw].filter(Boolean).join(" | ");
  if (p.gtin && p.sku) GTIN_TO_SKU[p.gtin] = p.sku;
  return p;
}
const seenCodes = new Set();
async function startCamera() {
  const box = document.getElementById("reader");
  box.style.display = "block";
  seenCodes.clear();
  toast("Scan the lower barcode for lot + serial");
  const onCode = (txt) => {
    if (!txt || seenCodes.has(txt)) return false;
    seenCodes.add(txt);
    const p = fillScanFrom(txt);
    if (p.gtin && !p.lot && !p.serial) {
      toast("Product code read. Point at the lower barcode");
      return false;
    }
    if (scanComplete()) { toast("Lot and serial filled"); stopCamera(); return true; }
    toast("Keep scanning the other bar");
    return false;
  };
  if ("BarcodeDetector" in window) {
    try {
      const det = new BarcodeDetector({ formats: ["code_128", "data_matrix", "qr_code", "ean_13", "code_39"] });
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } } });
      let video = document.getElementById("native-video");
      if (!video) {
        video = document.createElement("video");
        video.id = "native-video";
        video.setAttribute("playsinline", "true");
        video.style.width = "100%";
        box.innerHTML = "";
        box.appendChild(video);
      }
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
  if (!window.Html5Qrcode) { toast("Type serial, lot and REF instead"); return; }
  html5Qr = new Html5Qrcode("reader");
  try {
    await html5Qr.start({ facingMode: "environment" }, { fps: 12, qrbox: { width: 280, height: 160 } }, (txt) => onCode(txt));
  } catch (e) {
    toast("Camera blocked. Type the values or use a photo");
  }
}
