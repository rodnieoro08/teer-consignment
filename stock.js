// Pure helpers for dates, usage, transfers in transit and stock checks.
// No DOM and no Firebase in here, so these can be tested with `node --test`.

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const STATUS_LABELS = { "in-stock": "In stock", "used": "Used", "in-transit": "In transit", "quarantine": "Quarantine" };

function statusLabel(status) {
  return STATUS_LABELS[status] || String(status || "");
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

// Local calendar day, not UTC, so a case finished at 00:30 is logged on the right date.
function todayStr(now) {
  const d = now instanceof Date ? now : new Date(now || Date.now());
  return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate());
}

function daysAgoStr(days, now) {
  const d = now instanceof Date ? new Date(now.getTime()) : new Date(now || Date.now());
  d.setDate(d.getDate() - days);
  return todayStr(d);
}

function daysFromNowStr(days, now) {
  return daysAgoStr(-days, now);
}

// "2027-03-15" -> "15 Mar 2027". Anything else is returned unchanged.
function formatDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ""));
  if (!m) return String(iso || "");
  const month = MONTHS[parseInt(m[2], 10) - 1];
  if (!month) return String(iso);
  return parseInt(m[3], 10) + " " + month + " " + m[1];
}

function noteParts(notes) {
  return String(notes || "").split(" | ").map((part) => part.trim()).filter(Boolean);
}

const USED_RE = /^Used \d{4}-\d{2}-\d{2}$/;
const TRANSIT_RE = /^In transit from /;

function clearUsedStamp(notes) {
  return noteParts(notes).filter((part) => !USED_RE.test(part)).join(" | ");
}

function stampUsed(notes, dateStr) {
  return noteParts(clearUsedStamp(notes)).concat(["Used " + dateStr]).join(" | ").slice(0, 499);
}

function clearTransitStamp(notes) {
  return noteParts(notes).filter((part) => !TRANSIT_RE.test(part)).join(" | ");
}

function stampTransit(notes, fromName) {
  return noteParts(clearTransitStamp(notes)).concat(["In transit from " + fromName]).join(" | ").slice(0, 499);
}

function transitFrom(unit) {
  const part = noteParts(unit && unit.notes).find((item) => TRANSIT_RE.test(item));
  return part ? part.replace(TRANSIT_RE, "") : "";
}

// The day a unit was used. The stamp in the notes is exact. Units marked used before
// the stamp existed fall back to their last edit, which is the best the list knows.
function usedDate(unit) {
  if (!unit) return "";
  const part = noteParts(unit.notes).find((item) => USED_RE.test(item));
  if (part) return part.slice(5);
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(String(unit.updatedAt || ""));
  return m ? m[1] : "";
}

function usageRows(units, sinceStr) {
  return (units || []).filter((unit) => {
    if (!unit || unit.status !== "used") return false;
    const day = usedDate(unit);
    return !sinceStr || (day && day >= sinceStr);
  }).sort((a, b) => usedDate(b).localeCompare(usedDate(a)) || String(a.serial || "").localeCompare(String(b.serial || "")));
}

function usageText(rows, deps, title) {
  const lookup = deps || {};
  const catalogOf = lookup.catalogOf || (() => ({}));
  const hospitalOf = lookup.hospitalOf || (() => ({}));
  const lines = [title || "TEER usage"];
  if (!rows.length) {
    lines.push("Nothing marked used in this period.");
    return lines.join("\n");
  }
  const groups = new Map();
  rows.forEach((unit) => {
    const name = (hospitalOf(unit.hospitalId) || {}).name || unit.hospitalId || "";
    if (!groups.has(name)) groups.set(name, []);
    groups.get(name).push(unit);
  });
  Array.from(groups.keys()).sort().forEach((name) => {
    lines.push("");
    lines.push(name + " (" + groups.get(name).length + ")");
    groups.get(name).forEach((unit) => {
      const item = catalogOf(unit.sku) || {};
      lines.push("- " + formatDate(usedDate(unit)) + " · " + [item.family, item.size].filter(Boolean).join(" ") + " · REF " + unit.sku + " · SN " + unit.serial + (unit.lot ? " · lot " + unit.lot : ""));
    });
  });
  return lines.join("\n");
}

// First expiring, first out. Where a shelf holds two or more usable units of the same
// family and size with different dates, the earliest one should go into the next case.
function useFirstIds(units, catalogOf, now) {
  const groups = new Map();
  (units || []).forEach((unit) => {
    if (!unit || unit.status !== "in-stock" || !unit.expiry) return;
    const days = daysUntilExpiryOf(unit.expiry, now);
    if (days == null || days < 0) return;
    const item = catalogOf(unit.sku) || {};
    const key = [unit.hospitalId, item.family, item.size].join("|");
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(unit);
  });
  const ids = new Set();
  groups.forEach((list) => {
    if (list.length < 2) return;
    list.sort((a, b) => String(a.expiry).localeCompare(String(b.expiry)));
    if (list[0].expiry !== list[list.length - 1].expiry) ids.add(list[0].id);
  });
  return ids;
}

function daysUntilExpiryOf(expiry, now) {
  if (!expiry || !/^\d{4}-\d{2}-\d{2}$/.test(expiry)) return null;
  const end = new Date(expiry + "T00:00:00");
  const start = now instanceof Date ? now : new Date(now || Date.now());
  if (Number.isNaN(end.getTime()) || Number.isNaN(start.getTime())) return null;
  const days = Math.ceil((end - start) / 86400000);
  return days === 0 ? 0 : days;
}

// A stock check compares what the list says is on a shelf with what was actually seen.
function checkReport(spec) {
  const expected = spec.expected || [];
  const foundIds = new Set(spec.foundIds || []);
  const extras = spec.extras || [];
  const found = expected.filter((unit) => foundIds.has(unit.id));
  const missing = expected.filter((unit) => !foundIds.has(unit.id));
  const name = spec.hospitalName || "";
  const serials = (list) => list.map((item) => item.serial).join(", ");
  let log = "Stock check at " + name + ": " + found.length + " of " + expected.length + " found.";
  if (missing.length) log += " Missing: " + serials(missing) + ".";
  if (extras.length) log += " Not expected: " + serials(extras) + ".";
  if (log.length > 470) log = log.slice(0, 467) + "...";
  const lines = ["TEER stock check · " + name, formatDate(spec.date || ""), found.length + " of " + expected.length + " units found"];
  if (missing.length) {
    lines.push("");
    lines.push("Not found (" + missing.length + ")");
    missing.forEach((unit) => lines.push("- " + unit.sku + " · SN " + unit.serial + (unit.lot ? " · lot " + unit.lot : "")));
  }
  if (extras.length) {
    lines.push("");
    lines.push("On the shelf but not expected (" + extras.length + ")");
    extras.forEach((extra) => lines.push("- SN " + extra.serial + (extra.note ? " · " + extra.note : "")));
  }
  if (!missing.length && !extras.length) lines.push("Shelf matches the list.");
  return { found, missing, extras, log, text: lines.filter((line) => line !== undefined).join("\n") };
}

const CHECK_LOG_RE = /^Stock check at (.+?): (\d+) of (\d+) found\./;

// The newest "Stock check at <name>" line in the shared activity log.
function lastCheckFor(events, hospitalName) {
  let best = null;
  (events || []).forEach((event) => {
    const m = CHECK_LOG_RE.exec(String((event && event.text) || ""));
    if (!m || m[1] !== hospitalName) return;
    if (!best || String(event.at || "") > String(best.at || "")) {
      best = { at: event.at || "", by: event.by || "", found: parseInt(m[2], 10), total: parseInt(m[3], 10) };
    }
  });
  return best;
}

function eventsForSerial(events, serial) {
  const needle = String(serial || "").trim().toLowerCase();
  if (needle.length < 3) return [];
  return (events || []).filter((event) => {
    const text = String((event && event.text) || "").toLowerCase();
    const at = text.indexOf(needle);
    if (at === -1) return false;
    const after = text[at + needle.length];
    const before = at > 0 ? text[at - 1] : "";
    return !/[a-z0-9]/.test(after || "") && !/[a-z0-9]/.test(before || "");
  });
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    statusLabel,
    todayStr,
    daysAgoStr,
    daysFromNowStr,
    formatDate,
    stampUsed,
    clearUsedStamp,
    stampTransit,
    clearTransitStamp,
    transitFrom,
    usedDate,
    usageRows,
    usageText,
    useFirstIds,
    checkReport,
    lastCheckFor,
    eventsForSerial
  };
}
