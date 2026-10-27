const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

test("service worker claims clients, times out the network, and caches the scanner and Firebase", () => {
  const src = fs.readFileSync(require("node:path").join(__dirname, "..", "sw.js"), "utf8");
  assert.match(src, /skipWaiting/);
  assert.match(src, /clients\.claim/);
  assert.match(src, /NETWORK_TIMEOUT_MS = 4000/);
  assert.match(src, /firebase-firestore-compat\.js/);
  assert.match(src, /@zxing\/library@0\.21\.3/);
  assert.match(src, /apple-touch-icon\.png/);
});
