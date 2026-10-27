/* GS1 element strings. FNC1 / GS (ASCII 29) ends a variable-length AI
   unless that AI is the last field. Do not strip the separator before parsing. */

const GS1_GS = "\u001d";

const GS1_FIXED = {
  "00": 18,
  "01": 14,
  "02": 14,
  "11": 6,
  "12": 6,
  "13": 6,
  "15": 6,
  "16": 6,
  "17": 6,
  "20": 2
};

const GS1_VARIABLE = {
  "10": 20,
  "21": 20,
  "22": 20,
  "30": 8,
  "37": 8,
  "90": 30,
  "91": 90,
  "92": 30,
  "93": 30,
  "94": 30,
  "95": 30,
  "96": 30,
  "97": 30,
  "98": 30,
  "99": 30,
  "240": 30,
  "241": 30,
  "250": 30,
  "251": 30,
  "400": 30,
  "420": 20
};

function gs1Date(value) {
  if (!value || !/^\d{6}$/.test(value)) return "";
  return "20" + value.slice(0, 2) + "-" + value.slice(2, 4) + "-" + value.slice(4, 6);
}

function gs1AiAt(input, index) {
  const four = input.slice(index, index + 4);
  const three = input.slice(index, index + 3);
  const two = input.slice(index, index + 2);
  if (/^3[1-6]\d{2}$/.test(four)) return { ai: four, length: 6, variable: false };
  if (Object.prototype.hasOwnProperty.call(GS1_FIXED, four)) return { ai: four, length: GS1_FIXED[four], variable: false };
  if (Object.prototype.hasOwnProperty.call(GS1_VARIABLE, four)) return { ai: four, length: GS1_VARIABLE[four], variable: true };
  if (Object.prototype.hasOwnProperty.call(GS1_FIXED, three)) return { ai: three, length: GS1_FIXED[three], variable: false };
  if (Object.prototype.hasOwnProperty.call(GS1_VARIABLE, three)) return { ai: three, length: GS1_VARIABLE[three], variable: true };
  if (Object.prototype.hasOwnProperty.call(GS1_FIXED, two)) return { ai: two, length: GS1_FIXED[two], variable: false };
  if (Object.prototype.hasOwnProperty.call(GS1_VARIABLE, two)) return { ai: two, length: GS1_VARIABLE[two], variable: true };
  return null;
}

function blankGs1() {
  return { gtin: "", expiry: "", lot: "", serial: "", prodDate: "", elements: {} };
}

function assignGs1(out) {
  const el = out.elements;
  if (el["01"]) out.gtin = el["01"];
  else if (el["02"]) out.gtin = el["02"];
  if (el["17"]) out.expiry = gs1Date(el["17"]);
  if (el["11"]) out.prodDate = gs1Date(el["11"]);
  if (el["10"]) out.lot = el["10"];
  if (el["21"]) out.serial = el["21"];
  else if (el["91"]) out.serial = el["91"];
  return out;
}

function parseGs1Elements(input) {
  const out = blankGs1();
  let raw = String(input || "").replace(/^\uFEFF/, "").trim();
  raw = raw.replace(/^\][A-Za-z][0-9A-Za-z]/, "");
  if (!raw || /\(\d{2,4}\)/.test(raw)) return out;
  let i = 0;
  while (i < raw.length) {
    if (raw[i] === GS1_GS) {
      i++;
      continue;
    }
    const spec = gs1AiAt(raw, i);
    if (!spec) break;
    i += spec.ai.length;
    let value = "";
    if (spec.variable) {
      const end = raw.indexOf(GS1_GS, i);
      const sliceEnd = end === -1 ? raw.length : end;
      value = raw.slice(i, Math.min(sliceEnd, i + spec.length));
      i = end === -1 ? raw.length : end + 1;
    } else {
      value = raw.slice(i, i + spec.length);
      if (value.length < spec.length) break;
      i += spec.length;
    }
    out.elements[spec.ai] = value;
  }
  return assignGs1(out);
}

function parseGs1Hri(input) {
  const out = blankGs1();
  const compact = String(input || "").replace(/\s+/g, "");
  const re = /\((\d{2,4})\)([^()]*)/g;
  let match;
  while ((match = re.exec(compact))) {
    const ai = match[1];
    const value = match[2].replace(/[^A-Za-z0-9\-]/g, "");
    if (!value) continue;
    out.elements[ai] = value;
  }
  return assignGs1(out);
}

function parseBarcode(input) {
  const raw = String(input || "").trim();
  const hri = parseGs1Hri(raw);
  const concat = parseGs1Elements(raw);
  const out = blankGs1();
  out.gtin = hri.gtin || concat.gtin;
  out.expiry = hri.expiry || concat.expiry;
  out.lot = hri.lot || concat.lot;
  out.serial = hri.serial || concat.serial;
  out.prodDate = hri.prodDate || concat.prodDate;
  out.elements = Object.assign({}, concat.elements, hri.elements);
  return out;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { GS1_GS, parseGs1Elements, parseGs1Hri, parseBarcode, gs1Date };
}
