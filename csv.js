function csvField(value) {
  const s = value == null ? "" : String(value);
  return '"' + s.replace(/"/g, '""') + '"';
}

function toCsv(rows) {
  return rows.map((row) => row.map(csvField).join(",")).join("\r\n") + "\r\n";
}

function parseCsv(text) {
  const src = String(text || "").replace(/^\uFEFF/, "");
  const rows = [];
  let row = [];
  let field = "";
  let i = 0;
  let inQuotes = false;
  while (i < src.length) {
    const c = src[i];
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += c;
      i++;
      continue;
    }
    if (c === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (c === ",") {
      row.push(field);
      field = "";
      i++;
      continue;
    }
    if (c === "\r") {
      i++;
      continue;
    }
    if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      i++;
      continue;
    }
    field += c;
    i++;
  }
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function unitsToCsv(units, lookup) {
  const rows = [["hospital", "city", "sku", "size", "serial", "lot", "expiry", "status", "notes"]];
  units.forEach((u) => {
    const h = lookup.hospital(u.hospitalId) || { name: "", city: "" };
    const c = lookup.catalog(u.sku) || { size: "" };
    rows.push([
      h.name || "",
      h.city || "",
      u.sku || "",
      c.size || "",
      u.serial || "",
      u.lot || "",
      u.expiry || "",
      u.status || "",
      u.notes || ""
    ]);
  });
  return toCsv(rows);
}

function csvToUnitRows(text) {
  const table = parseCsv(text).filter((r) => r.some((cell) => String(cell).trim() !== ""));
  if (!table.length) return [];
  const head = table[0].map((s) => String(s).trim().toLowerCase());
  const idx = (name) => head.indexOf(name);
  const take = (cols, name) => {
    const i = idx(name);
    return i >= 0 && i < cols.length ? String(cols[i] == null ? "" : cols[i]).trim() : "";
  };
  return table.slice(1).map((cols) => ({
    hospital: take(cols, "hospital"),
    city: take(cols, "city"),
    sku: take(cols, "sku") || take(cols, "ref"),
    serial: take(cols, "serial") || take(cols, "sn"),
    lot: take(cols, "lot"),
    expiry: take(cols, "expiry") || take(cols, "exp"),
    status: (take(cols, "status") || "in-stock").toLowerCase(),
    notes: take(cols, "notes")
  })).filter((row) => row.serial);
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { toCsv, parseCsv, unitsToCsv, csvToUnitRows };
}
