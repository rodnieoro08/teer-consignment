const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

test("rules restrict stock to the team list and keep events append-only", () => {
  const src = fs.readFileSync(path.join(__dirname, "..", "firestore.rules"), "utf8");
  assert.match(src, /function isAdmin\(\)/);
  assert.match(src, /function isActiveMember\(\)/);
  assert.match(src, /match \/members\/\{emailId\}/);
  assert.match(src, /match \/events\/\{id\}/);
  assert.match(src, /allow update, delete: if false;/);
  assert.match(src, /allow create: if isActiveMember\(\) && validEvent\(id\);/);
  assert.match(src, /match \/pars\/\{id\}/);
  assert.match(src, /allow create, update: if isActiveMember\(\) && validPar\(id\);/);
  assert.match(src, /getAfter\(\/databases\/\$\(database\)\/documents\/meta\/bootstrap\)/);
  assert.match(src, /allow delete: if isAdmin\(\)/);
  assert.match(src, /match \/serials\/\{key\}/);
  assert.match(src, /ev\.action == "delete"/);
  assert.doesNotMatch(src, /allow read, write: if signedIn\(\);/);
  assert.match(src, /data\.status in \["in-stock", "used", "in-transit", "quarantine"\]/);
});
