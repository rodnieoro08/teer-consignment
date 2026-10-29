const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const emulator = process.env.FIRESTORE_EMULATOR_HOST;
const skip = emulator ? false : "Firestore emulator is not running";

function member(email, role) {
  return {
    email,
    name: "Test",
    role,
    active: true,
    updatedAt: "2026-10-29T09:00:00.000Z",
    updatedBy: "test"
  };
}
function unit(id, serial) {
  return {
    id,
    hospitalId: "barts",
    sku: "CDS0802-XTW",
    serial,
    lot: "LOT1",
    expiry: "2027-01-01",
    status: "in-stock",
    notes: "",
    createdAt: "2026-10-29T09:00:00.000Z",
    updatedAt: "2026-10-29T09:00:00.000Z",
    updatedBy: "test"
  };
}
function activity(id, action, text) {
  return {
    id,
    at: "2026-10-29T09:00:00.000Z",
    text,
    by: "test",
    action,
    updatedAt: "2026-10-29T09:00:00.000Z",
    updatedBy: "test"
  };
}

let env;
let testing;
let fsApi;

test.before(async () => {
  if (!emulator) return;
  testing = require("@firebase/rules-unit-testing");
  fsApi = require("firebase/firestore");
  env = await testing.initializeTestEnvironment({
    projectId: "teer-rules-test",
    firestore: {
      rules: fs.readFileSync(path.join(__dirname, "..", "firestore.rules"), "utf8")
    }
  });
});

test.after(async () => {
  if (env) await env.cleanup();
});

test.beforeEach(async () => {
  if (env) await env.clearFirestore();
});

function dbFor(email) {
  return env.authenticatedContext(email.replace(/[^a-z]/g, ""), { email }).firestore();
}

test("only one first-admin claim can succeed, and it must include the lock", { skip }, async () => {
  const { assertFails, assertSucceeds } = testing;
  const { doc, writeBatch, getDoc, setDoc } = fsApi;
  const alice = dbFor("alice@example.com");
  const bob = dbFor("bob@example.com");
  const claim = (db, email) => {
    const batch = writeBatch(db);
    batch.set(doc(db, "members/" + email), member(email, "admin"));
    batch.set(doc(db, "meta/bootstrap"), { claimed: true, email, at: "2026-10-29T09:00:00.000Z" });
    return batch.commit();
  };
  await assertSucceeds(claim(alice, "alice@example.com"));
  await assertFails(claim(bob, "bob@example.com"));
  await assertFails(setDoc(doc(bob, "members/bob@example.com"), member("bob@example.com", "admin")));
  const lock = await getDoc(doc(alice, "meta/bootstrap"));
  assert.equal(lock.data().email, "alice@example.com");
});

test("two first-admin claims sent together still leave one admin", { skip }, async () => {
  const { assertSucceeds } = testing;
  const { doc, getDoc, writeBatch } = fsApi;
  const claim = (db, email) => {
    const batch = writeBatch(db);
    batch.set(doc(db, "members/" + email), member(email, "admin"));
    batch.set(doc(db, "meta/bootstrap"), { claimed: true, email, at: "2026-10-29T09:00:00.000Z" });
    return assertSucceeds(batch.commit());
  };
  const results = await Promise.allSettled([
    claim(dbFor("carol@example.com"), "carol@example.com"),
    claim(dbFor("dave@example.com"), "dave@example.com")
  ]);
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    const carol = await getDoc(doc(db, "members/carol@example.com"));
    const dave = await getDoc(doc(db, "members/dave@example.com"));
    const lock = await getDoc(doc(db, "meta/bootstrap"));
    const winners = [carol, dave].filter((snap) => snap.exists());
    assert.equal(winners.length, 1);
    assert.equal(lock.exists(), true);
    assert.equal(lock.data().email, winners[0].data().email);
  });
});

test("a member can add a serial once, cannot delete it, and an admin delete is logged", { skip }, async () => {
  const { assertFails, assertSucceeds } = testing;
  const { doc, setDoc, writeBatch, getDoc, updateDoc } = fsApi;
  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, "members/admin@example.com"), member("admin@example.com", "admin"));
    await setDoc(doc(db, "meta/bootstrap"), { claimed: true, email: "admin@example.com", at: "2026-10-29T09:00:00.000Z" });
    await setDoc(doc(db, "members/member@example.com"), member("member@example.com", "member"));
  });
  const memberDb = dbFor("member@example.com");
  const adminDb = dbFor("admin@example.com");
  const outsider = dbFor("outsider@example.com");
  const put = (db, id, serial) => {
    const batch = writeBatch(db);
    batch.set(doc(db, "units/" + id), unit(id, serial));
    batch.set(doc(db, "serials/" + serial.toLowerCase()), { unitId: id, serial });
    return batch.commit();
  };
  await assertFails(getDoc(doc(outsider, "units/unit-1")));
  await assertSucceeds(put(memberDb, "unit-1", "SN10001"));
  await assertFails(put(memberDb, "unit-2", "SN10001"));
  const memberDelete = writeBatch(memberDb);
  memberDelete.delete(doc(memberDb, "units/unit-1"));
  await assertFails(memberDelete.commit());
  const bare = writeBatch(adminDb);
  bare.delete(doc(adminDb, "units/unit-1"));
  await assertFails(bare.commit());
  const logged = writeBatch(adminDb);
  logged.delete(doc(adminDb, "units/unit-1"));
  logged.delete(doc(adminDb, "serials/sn10001"));
  logged.set(doc(adminDb, "events/del-unit-1"), activity("del-unit-1", "delete", "Deleted SN10001"));
  await assertSucceeds(logged.commit());
  await assertFails(updateDoc(doc(adminDb, "events/del-unit-1"), { text: "rewritten" }));
  const gone = await getDoc(doc(adminDb, "units/unit-1"));
  assert.equal(gone.exists(), false);
});

test("a serial stays unique when it is edited, and a move has to take the lock with it", { skip }, async () => {
  const { assertFails, assertSucceeds } = testing;
  const { doc, setDoc, writeBatch, getDoc } = fsApi;
  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, "members/member@example.com"), member("member@example.com", "member"));
    await setDoc(doc(db, "meta/bootstrap"), { claimed: true, email: "admin@example.com", at: "2026-10-29T09:00:00.000Z" });
  });
  const memberDb = dbFor("member@example.com");
  const put = (db, id, serial) => {
    const batch = writeBatch(db);
    batch.set(doc(db, "units/" + id), unit(id, serial));
    batch.set(doc(db, "serials/" + serial.toLowerCase()), { unitId: id, serial });
    return batch.commit();
  };
  await assertSucceeds(put(memberDb, "unit-1", "SN10001"));
  const same = writeBatch(memberDb);
  same.set(doc(memberDb, "units/unit-1"), Object.assign(unit("unit-1", "SN10001"), { notes: "Checked" }));
  await assertSucceeds(same.commit());
  const bare = writeBatch(memberDb);
  bare.set(doc(memberDb, "units/unit-1"), unit("unit-1", "SN10002"));
  await assertFails(bare.commit());
  const moved = writeBatch(memberDb);
  moved.set(doc(memberDb, "units/unit-1"), unit("unit-1", "SN10002"));
  moved.delete(doc(memberDb, "serials/sn10001"));
  moved.set(doc(memberDb, "serials/sn10002"), { unitId: "unit-1", serial: "SN10002" });
  await assertSucceeds(moved.commit());
  await assertFails(put(memberDb, "unit-2", "SN10002"));
  const kept = await getDoc(doc(memberDb, "units/unit-1"));
  assert.equal(kept.data().serial, "SN10002");
});
