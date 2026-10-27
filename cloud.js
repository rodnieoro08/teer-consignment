const FB_KEY = "teer-consign-fb";
const EVENTS_PAGE = 80;
const cloud = {
  app: null,
  auth: null,
  db: null,
  user: null,
  live: false,
  people: [],
  lastError: "",
  unsub: [],
  authBound: false,
  localOnly: 0,
  eventsHasMore: false
};
let eventsCursor = null;
let holdUnitSnaps = 0;
let queuedUnitRows = null;
const unitUploadStamp = new Map();
const unitDeleteAttempt = new Set();
const eventUploadStamp = new Set();

function loadFbConfig() {
  try { return JSON.parse(localStorage.getItem(FB_KEY) || "null"); } catch (_) { return null; }
}
function saveFbConfig(cfg) {
  localStorage.setItem(FB_KEY, JSON.stringify(cfg));
}

function parseFirebaseConfig(text) {
  const raw = (text || "").trim();
  if (!raw) return null;
  if (raw.startsWith("{")) return JSON.parse(raw);
  const grab = (k) => {
    const m = raw.match(new RegExp(k + "[\"']?\\s*:\\s*[\"']([^\"']+)"));
    return m ? m[1] : "";
  };
  const cfg = {
    apiKey: grab("apiKey"),
    authDomain: grab("authDomain"),
    projectId: grab("projectId"),
    storageBucket: grab("storageBucket"),
    messagingSenderId: grab("messagingSenderId"),
    appId: grab("appId")
  };
  if (!cfg.apiKey || !cfg.projectId) throw new Error("Need apiKey and projectId");
  return cfg;
}

function whoName() {
  return (state.settings.specialist || (cloud.user && (cloud.user.displayName || cloud.user.email)) || "Specialist").trim();
}

function sameFirebaseConfig(opts, cfg) {
  return !!opts && opts.projectId === cfg.projectId && opts.apiKey === cfg.apiKey && (opts.appId || "") === (cfg.appId || "");
}

async function initCloud() {
  const cfg = loadFbConfig();
  setLiveUi();
  if (!cfg || !window.firebase) return;
  try {
    if (firebase.apps.length) {
      const existing = firebase.app();
      const changed = !sameFirebaseConfig(existing.options || {}, cfg);
      if (!changed && cloud.authBound) {
        setLiveUi();
        return;
      }
      if (changed) {
        stopLive();
        cloud.authBound = false;
        cloud.user = null;
        try {
          await existing.delete();
        } catch (_) {
          cloud.lastError = "Firebase config changed. Reload the page to connect to the new project.";
          setLiveUi();
          return;
        }
      }
    }
    if (!firebase.apps.length) cloud.app = firebase.initializeApp(cfg);
    else cloud.app = firebase.app();
    cloud.auth = firebase.auth();
    cloud.db = firebase.firestore();
    try { await cloud.db.enablePersistence({ synchronizeTabs: true }); } catch (_) {}
    if (!cloud.authBound) {
      cloud.authBound = true;
      cloud.auth.onAuthStateChanged(async (user) => {
        cloud.user = user;
        if (user) {
          if (!state.settings.specialist && (user.displayName || user.email)) {
            state.settings.specialist = user.displayName || user.email.split("@")[0];
            saveLocalOnly();
          }
          await startLive();
        } else {
          stopLive();
        }
        setLiveUi();
      });
    }
    cloud.lastError = "";
    setLiveUi();
  } catch (e) {
    cloud.lastError = e.message || "Could not start Firebase";
    setLiveUi();
  }
}

function saveLocalOnly() {
  localStorage.setItem(KEY, JSON.stringify({
    units: state.units,
    events: state.events.slice(0, 300),
    settings: state.settings,
    hospitalsExtra: state.hospitals.filter((h) => h.custom),
    sync: state.sync || { pendingUnitIds: [], pendingDeleteIds: [], seenUnitIds: [], pendingEventIds: [] }
  }));
}

function ensureSync() {
  if (!state.sync) {
    state.sync = { pendingUnitIds: [], pendingDeleteIds: [], seenUnitIds: [], pendingEventIds: [] };
  }
  ["pendingUnitIds", "pendingDeleteIds", "seenUnitIds", "pendingEventIds"].forEach((key) => {
    if (!Array.isArray(state.sync[key])) state.sync[key] = [];
  });
}

function applyUnitSnapshot(rows) {
  if (holdUnitSnaps) {
    queuedUnitRows = rows;
    return;
  }
  ensureSync();
  const merged = mergeUnitLists(state.units, rows, state.sync);
  state.units = merged.units;
  state.sync.seenUnitIds = rows.map((row) => row.id).filter(Boolean);
  cloud.localOnly = merged.localOnly;
  saveLocalOnly();
  refresh();
  if (merged.localOnly && !cloud._announcedLocal) {
    cloud._announcedLocal = true;
    toast(merged.localOnly + " on this phone are not on the shared list yet. Upload when you are ready.");
  }
  flushUnitUploads(merged.uploads);
  flushUnitDeletes(merged.deletes);
}

async function flushUnitUploads(uploads) {
  if (!uploads || !uploads.length || !cloud.live) return;
  holdUnitSnaps += 1;
  try {
    for (const unit of uploads) {
      const stamp = (unit.id || "") + "|" + (unit.updatedAt || "") + "|" + (unit.serial || "");
      if (unitUploadStamp.get(unit.id) === stamp) continue;
      unitUploadStamp.set(unit.id, stamp);
      try {
        await cloudUpsert("units", unit.id, unit);
        if (typeof clearPendingUnit === "function") clearPendingUnit(unit.id);
        saveLocalOnly();
      } catch (e) {
        unitUploadStamp.delete(unit.id);
        toast(e.message || "Could not upload a unit");
      }
    }
  } finally {
    holdUnitSnaps -= 1;
    if (!holdUnitSnaps && queuedUnitRows) {
      const queued = queuedUnitRows;
      queuedUnitRows = null;
      applyUnitSnapshot(queued);
    }
  }
}

async function flushUnitDeletes(ids) {
  if (!ids || !ids.length || !cloud.live) return;
  for (const id of ids) {
    if (unitDeleteAttempt.has(id)) continue;
    unitDeleteAttempt.add(id);
    try {
      await cloudDelete("units", id);
      ensureSync();
      state.sync.pendingDeleteIds = state.sync.pendingDeleteIds.filter((item) => item !== id);
      saveLocalOnly();
    } catch (e) {
      unitDeleteAttempt.delete(id);
      toast(e.message || "Could not delete a unit");
    }
  }
}

function applyEventSnapshot(rows) {
  ensureSync();
  const merged = mergeEventLists(state.events, rows, state.sync);
  state.events = merged.events;
  if (typeof state.eventsHasMore !== "undefined") state.eventsHasMore = cloud.eventsHasMore;
  saveLocalOnly();
  refresh();
  flushEventUploads(merged.uploads);
}

async function flushEventUploads(uploads) {
  if (!uploads || !uploads.length || !cloud.live) return;
  for (const event of uploads) {
    if (eventUploadStamp.has(event.id)) continue;
    eventUploadStamp.add(event.id);
    try {
      await cloudUpsert("events", event.id, event);
      if (typeof clearPendingEvent === "function") clearPendingEvent(event.id);
      saveLocalOnly();
    } catch (e) {
      eventUploadStamp.delete(event.id);
    }
  }
}

async function startLive() {
  stopLive();
  cloud.live = true;
  cloud._announcedLocal = false;
  listenCol("units", applyUnitSnapshot);
  listenEvents();
  listenCol("hospitals", (rows) => {
    rows.forEach((h) => {
      if (!state.hospitals.find((item) => item.id === h.id)) state.hospitals.push(Object.assign({ custom: true }, h));
    });
    fillSelects();
    refresh();
  });
  listenCol("presence", (rows) => {
    const cutoff = Date.now() - 120000;
    cloud.people = rows.filter((person) => (person.ts || 0) > cutoff);
    setLiveUi();
  });
  await beatPresence();
  if (cloud._beat) clearInterval(cloud._beat);
  cloud._beat = setInterval(beatPresence, 25000);
}

function listenEvents() {
  eventsCursor = null;
  const query = cloud.db.collection("events").orderBy("at", "desc").limit(EVENTS_PAGE);
  const unsub = query.onSnapshot((snap) => {
    eventsCursor = snap.docs.length ? snap.docs[snap.docs.length - 1] : null;
    cloud.eventsHasMore = snap.size === EVENTS_PAGE;
    const rows = snap.docs.map((doc) => Object.assign({ id: doc.id }, doc.data()));
    applyEventSnapshot(rows);
  }, (err) => {
    cloud.lastError = err.message;
    setLiveUi();
  });
  cloud.unsub.push(unsub);
}

async function loadEarlierEvents() {
  if (!cloud.live || !eventsCursor) return;
  const snap = await cloud.db.collection("events").orderBy("at", "desc").startAfter(eventsCursor).limit(EVENTS_PAGE).get();
  eventsCursor = snap.docs.length ? snap.docs[snap.docs.length - 1] : null;
  cloud.eventsHasMore = snap.size === EVENTS_PAGE;
  const rows = snap.docs.map((doc) => Object.assign({ id: doc.id }, doc.data()));
  applyEventSnapshot(rows);
}

function listenCol(name, cb) {
  const unsub = cloud.db.collection(name).onSnapshot((snap) => {
    const rows = [];
    snap.forEach((doc) => rows.push(Object.assign({ id: doc.id }, doc.data())));
    cb(rows);
  }, (err) => {
    cloud.lastError = err.message;
    setLiveUi();
  });
  cloud.unsub.push(unsub);
}

function stopLive() {
  cloud.live = false;
  cloud.unsub.forEach((fn) => { try { fn(); } catch (_) {} });
  cloud.unsub = [];
  eventsCursor = null;
  if (cloud._beat) clearInterval(cloud._beat);
}

async function beatPresence() {
  if (!cloud.live || !cloud.user) return;
  await cloud.db.collection("presence").doc(cloud.user.uid).set({
    name: whoName(),
    email: cloud.user.email || "",
    ts: Date.now()
  }, { merge: true });
}

function strip(obj) {
  const out = {};
  Object.keys(obj || {}).forEach((key) => {
    if (obj[key] !== undefined) out[key] = obj[key];
  });
  return out;
}

async function cloudUpsert(col, id, data) {
  saveLocalOnly();
  if (!cloud.live) return;
  const payload = strip(Object.assign({}, data, {
    updatedAt: new Date().toISOString(),
    updatedBy: whoName()
  }));
  await cloud.db.collection(col).doc(id).set(payload, { merge: true });
}
async function cloudDelete(col, id) {
  saveLocalOnly();
  if (!cloud.live) return;
  await cloud.db.collection(col).doc(id).delete();
}

async function signInEmail(email, pass, create) {
  if (!cloud.auth) throw new Error("Save Firebase config first");
  if (create) await cloud.auth.createUserWithEmailAndPassword(email, pass);
  else await cloud.auth.signInWithEmailAndPassword(email, pass);
  const name = document.getElementById("who").value.trim();
  if (name && cloud.auth.currentUser) await cloud.auth.currentUser.updateProfile({ displayName: name });
}
async function signInGoogle() {
  if (!cloud.auth) throw new Error("Save Firebase config first");
  const provider = new firebase.auth.GoogleAuthProvider();
  await cloud.auth.signInWithPopup(provider);
}
async function signOutCloud() {
  if (cloud.user && cloud.db) {
    try { await cloud.db.collection("presence").doc(cloud.user.uid).delete(); } catch (_) {}
  }
  stopLive();
  if (cloud.auth) await cloud.auth.signOut();
  setLiveUi();
}

function setLiveUi() {
  const pill = document.getElementById("live-pill");
  const status = document.getElementById("live-status");
  const people = document.getElementById("live-people");
  const cfg = loadFbConfig();
  if (pill) {
    if (cloud.live && cloud.user) {
      pill.textContent = "Live";
      pill.className = "pill";
    } else if (cfg) {
      pill.textContent = "Sign in for live";
      pill.className = "pill warn";
    } else {
      pill.textContent = "This phone only";
      pill.className = "pill warn";
    }
  }
  if (status) {
    if (cloud.live && cloud.user) {
      status.textContent = "Connected to the shared UK stock list as " + (cloud.user.email || whoName()) + ".";
      if (cloud.localOnly) {
        status.textContent += " " + cloud.localOnly + " units are only on this phone. Use Upload this phone to the shared list before you rely on the cloud copy.";
      }
    } else if (cfg && cloud.auth) {
      status.textContent = "Firebase is configured. Sign in so edits reach the rest of the team.";
    } else {
      status.textContent = "Not live yet. One person creates a free Firebase project, pastes the config below, then the team signs in.";
    }
    if (cloud.lastError) status.textContent += " Last error: " + cloud.lastError;
  }
  if (people) {
    people.innerHTML = cloud.people.length
      ? cloud.people.map((person) => `<span class="chip in">${esc(person.name || person.email || "Colleague")}</span>`).join("")
      : `<span class="tiny">${cloud.live ? "Only you right now" : "Nobody live"}</span>`;
  }
  const signed = document.getElementById("signed-as");
  if (signed) signed.textContent = cloud.user ? (cloud.user.email || cloud.user.uid) : "Not signed in";
  const earlier = document.getElementById("btn-earlier");
  if (earlier) earlier.style.display = cloud.live && cloud.eventsHasMore ? "block" : "none";
}

async function pushLocalUp() {
  if (!cloud.live) { toast("Sign in first"); return; }
  ensureSync();
  try {
    let count = 0;
    for (const unit of state.units) {
      await cloudUpsert("units", unit.id, unit);
      if (typeof clearPendingUnit === "function") clearPendingUnit(unit.id);
      count += 1;
    }
    for (const id of state.sync.pendingDeleteIds.slice()) {
      await cloudDelete("units", id);
    }
    state.sync.pendingDeleteIds = [];
    for (const event of state.events) {
      if (state.sync.pendingEventIds.includes(event.id)) {
        await cloudUpsert("events", event.id, event);
        if (typeof clearPendingEvent === "function") clearPendingEvent(event.id);
      }
    }
    for (const hospital of state.hospitals.filter((item) => item.custom)) {
      await cloudUpsert("hospitals", hospital.id, hospital);
    }
    cloud.localOnly = 0;
    saveLocalOnly();
    toast("Uploaded " + count + " units to the shared list");
    setLiveUi();
  } catch (e) {
    saveLocalOnly();
    toast(e.message || "Upload failed");
  }
}
