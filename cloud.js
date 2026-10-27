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
  eventsHasMore: false,
  email: "",
  member: null,
  members: [],
  isMember: false,
  isAdmin: false
};
let eventsCursor = null;
let holdUnitSnaps = 0;
let queuedUnitRows = null;
let holdParSnaps = 0;
let queuedParRows = null;
const unitUploadStamp = new Map();
const unitDeleteAttempt = new Set();
const eventUploadStamp = new Set();
const parUploadStamp = new Map();
const parDeleteAttempt = new Set();

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
        stopAccessWatch();
        if (user) {
          if (!state.settings.specialist && (user.displayName || user.email)) {
            state.settings.specialist = user.displayName || user.email.split("@")[0];
            saveLocalOnly();
          }
          cloud.email = (user.email || "").trim().toLowerCase();
          if (!cloud.email) {
            stopLive();
            cloud.isMember = false;
            cloud.isAdmin = false;
          } else {
            watchMembership();
          }
        } else {
          cloud.email = "";
          cloud.member = null;
          cloud.members = [];
          cloud.isMember = false;
          cloud.isAdmin = false;
          cloud._bootstrapTried = false;
          stopLive();
        }
        setLiveUi();
        renderAccess();
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
    pars: state.pars || [],
    sync: state.sync || emptySync()
  }));
}

function ensureSync() {
  if (!state.sync) {
    state.sync = emptySync();
  }
  ["pendingUnitIds", "pendingDeleteIds", "seenUnitIds", "pendingEventIds", "pendingParIds", "pendingParDeleteIds", "seenParIds"].forEach((key) => {
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

function applyParSnapshot(rows) {
  if (holdParSnaps) {
    queuedParRows = rows;
    return;
  }
  ensureSync();
  const merged = mergeParLists(state.pars || [], rows, state.sync);
  state.pars = merged.pars;
  state.sync.seenParIds = rows.map((row) => row.id).filter(Boolean);
  saveLocalOnly();
  refresh();
  flushParUploads(merged.uploads);
  flushParDeletes(merged.deletes);
}

async function flushParUploads(uploads) {
  if (!uploads || !uploads.length || !cloud.live) return;
  holdParSnaps += 1;
  try {
    for (const par of uploads) {
      const stamp = (par.id || "") + "|" + (par.par || "") + "|" + (par.updatedAt || "");
      if (parUploadStamp.get(par.id) === stamp) continue;
      parUploadStamp.set(par.id, stamp);
      try {
        await cloudUpsert("pars", par.id, par);
        if (typeof clearPendingPar === "function") clearPendingPar(par.id);
        saveLocalOnly();
      } catch (e) {
        parUploadStamp.delete(par.id);
        toast(e.message || "Could not upload a par level");
      }
    }
  } finally {
    holdParSnaps -= 1;
    if (!holdParSnaps && queuedParRows) {
      const queued = queuedParRows;
      queuedParRows = null;
      applyParSnapshot(queued);
    }
  }
}

async function flushParDeletes(ids) {
  if (!ids || !ids.length || !cloud.live) return;
  for (const id of ids) {
    if (parDeleteAttempt.has(id)) continue;
    parDeleteAttempt.add(id);
    try {
      await cloudDelete("pars", id);
      if (typeof clearPendingParDelete === "function") clearPendingParDelete(id);
      saveLocalOnly();
    } catch (e) {
      parDeleteAttempt.delete(id);
      toast(e.message || "Could not delete a par level");
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
      if (!e || e.code !== "permission-denied") eventUploadStamp.delete(event.id);
    }
  }
}

let startingLive = false;
async function startLive() {
  if (cloud.live || startingLive) return;
  startingLive = true;
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
  listenCol("pars", applyParSnapshot);
  listenCol("presence", (rows) => {
    const cutoff = Date.now() - 120000;
    cloud.people = rows.filter((person) => (person.ts || 0) > cutoff);
    setLiveUi();
  });
  try {
    await beatPresence();
    if (cloud._beat) clearInterval(cloud._beat);
    cloud._beat = setInterval(beatPresence, 25000);
  } finally {
    startingLive = false;
  }
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

function stopAccessWatch() {
  if (cloud._memberDocUnsub) { try { cloud._memberDocUnsub(); } catch (_) {} cloud._memberDocUnsub = null; }
  if (cloud._membersUnsub) { try { cloud._membersUnsub(); } catch (_) {} cloud._membersUnsub = null; }
}

function watchMembership() {
  if (!cloud.db || !cloud.email || cloud._memberDocUnsub) return;
  cloud._memberDocUnsub = cloud.db.collection("members").doc(cloud.email).onSnapshot(async (doc) => {
    cloud.member = doc.exists ? doc.data() : null;
    cloud.isMember = !!(cloud.member && cloud.member.active === true);
    cloud.isAdmin = !!(cloud.isMember && cloud.member.role === "admin");
    cloud.lastError = "";
    if (cloud.isMember) {
      if (!cloud.live) {
        try { await startLive(); } catch (e) { cloud.lastError = e.message || "Could not open the shared list"; }
      }
      ensureBootstrap();
    } else if (cloud.live) {
      stopLive();
    }
    if (cloud.isAdmin) watchMemberList();
    else if (cloud._membersUnsub) {
      try { cloud._membersUnsub(); } catch (_) {}
      cloud._membersUnsub = null;
      cloud.members = [];
    }
    setLiveUi();
    renderAccess();
  }, (err) => {
    cloud.isMember = false;
    cloud.isAdmin = false;
    if (cloud.live) stopLive();
    cloud.lastError = err.code === "permission-denied"
      ? "Firestore refused the team list. Publish firestore.rules from this repo, then claim the first admin seat or ask an admin to add your email."
      : (err.message || "Could not read the team list");
    setLiveUi();
    renderAccess();
  });
}

function watchMemberList() {
  if (!cloud.db || cloud._membersUnsub) return;
  cloud._membersUnsub = cloud.db.collection("members").onSnapshot((snap) => {
    const rows = [];
    snap.forEach((doc) => rows.push(Object.assign({ id: doc.id }, doc.data())));
    rows.sort((a, b) => String(a.email || "").localeCompare(String(b.email || "")));
    cloud.members = rows;
    renderAccess();
  }, (err) => {
    cloud.lastError = err.message || "Could not list the team";
    setLiveUi();
  });
}

async function ensureBootstrap() {
  if (!cloud.isAdmin || !cloud.email || cloud._bootstrapTried) return;
  cloud._bootstrapTried = true;
  try {
    const doc = await cloud.db.collection("meta").doc("bootstrap").get();
    if (doc.exists) return;
    await cloud.db.collection("meta").doc("bootstrap").set({
      claimed: true,
      email: cloud.email,
      at: new Date().toISOString()
    });
  } catch (_) {}
}

function accessPayload(email, name, role) {
  return {
    email,
    name: String(name || "").slice(0, 79),
    role: role === "admin" ? "admin" : "member",
    active: true,
    updatedAt: new Date().toISOString(),
    updatedBy: whoName().slice(0, 79)
  };
}

async function claimAdmin() {
  if (!cloud.db || !cloud.email) { toast("Sign in with an email address first"); return; }
  try {
    await cloud.db.collection("members").doc(cloud.email).set(accessPayload(cloud.email, whoName(), "admin"));
    await cloud.db.collection("meta").doc("bootstrap").set({
      claimed: true,
      email: cloud.email,
      at: new Date().toISOString()
    });
    toast("You are the first admin. Add the rest of the team.");
  } catch (e) {
    toast(e.message || "Could not claim admin. Publish the rules, or ask the existing admin to add you.");
  }
}

async function addMember() {
  const email = (document.getElementById("member-email").value || "").trim().toLowerCase();
  const name = (document.getElementById("member-name").value || "").trim();
  const role = document.getElementById("member-role").value;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { toast("Enter a valid email"); return; }
  try {
    await cloud.db.collection("members").doc(email).set(accessPayload(email, name, role));
    document.getElementById("member-email").value = "";
    document.getElementById("member-name").value = "";
    toast("Added " + email);
  } catch (e) {
    toast(e.message || "Could not add that email");
  }
}

async function removeMember(email) {
  if (!email || email === cloud.email) return;
  if (!confirm("Remove " + email + " from the team list? They will lose the shared stock list.")) return;
  try {
    await cloud.db.collection("members").doc(email).delete();
    toast("Removed " + email);
  } catch (e) {
    toast(e.message || "Could not remove that email");
  }
}

function renderAccess() {
  const status = document.getElementById("access-status");
  const actions = document.getElementById("access-actions");
  if (!status || !actions) return;
  if (!cloud.user) {
    status.textContent = "Sign in first. Creating a login does not grant access. An admin adds the email to the team list.";
    actions.innerHTML = "";
    return;
  }
  if (!cloud.email) {
    status.textContent = "This login has no email address, so it cannot be matched to the team list.";
    actions.innerHTML = "";
    return;
  }
  if (cloud.lastError && !cloud.isMember) {
    status.textContent = cloud.lastError;
  } else if (!cloud.isMember) {
    status.textContent = cloud.email + " is not on the team list. If you are setting Firebase up, claim the first admin seat once, before anyone else. Otherwise ask an admin to add this email.";
  } else if (!cloud.isAdmin) {
    status.textContent = "You are on the team list as " + cloud.email + ".";
  } else {
    status.textContent = "You are an admin. Add each specialist's email before they sign in. They still create their own login.";
  }
  if (!cloud.isMember) {
    actions.innerHTML = cloud.email ? `<button class="primary" id="btn-claim-admin" type="button">Claim first admin</button>` : "";
    const claim = document.getElementById("btn-claim-admin");
    if (claim) claim.addEventListener("click", claimAdmin);
    return;
  }
  if (!cloud.isAdmin) {
    actions.innerHTML = "";
    return;
  }
  const rows = (cloud.members || []).map((member) => {
    const self = member.email === cloud.email;
    return `<div class="row"><div><div class="t">${esc(member.email)}</div><div class="m">${esc(member.name || "No name")} · ${esc(member.role || "member")}${member.active === false ? " · inactive" : ""}</div></div></div>${self ? "" : `<button class="danger" type="button" data-remove-member="${esc(member.email)}">Remove</button>`}`;
  }).join("");
  actions.innerHTML = `<div class="field"><label>Email</label><input id="member-email" type="email" placeholder="name@company.com" autocomplete="off"></div><div class="grid-2" style="margin-top:8px"><div class="field"><label>Name</label><input id="member-name" placeholder="Initials"></div><div class="field"><label>Role</label><select id="member-role"><option value="member">Member</option><option value="admin">Admin</option></select></div></div><button class="primary" id="btn-add-member" type="button">Add to team list</button><div style="margin-top:12px">${rows || `<div class="empty">No one else yet</div>`}</div>`;
  document.getElementById("btn-add-member").addEventListener("click", addMember);
  actions.querySelectorAll("[data-remove-member]").forEach((button) => {
    button.addEventListener("click", () => removeMember(button.getAttribute("data-remove-member")));
  });
}

async function beatPresence() {
  if (!cloud.live || !cloud.user) return;
  await cloud.db.collection("presence").doc(cloud.user.uid).set({
    name: whoName(),
    email: cloud.user.email || "",
    ts: Date.now()
  }, { merge: true });
}

const CLOUD_FIELDS = {
  units: ["id", "hospitalId", "sku", "serial", "lot", "expiry", "status", "notes", "createdAt", "updatedAt", "updatedBy"],
  events: ["id", "at", "text", "by", "updatedAt", "updatedBy"],
  hospitals: ["id", "name", "city", "region", "custom", "updatedAt", "updatedBy"],
  pars: ["hospitalId", "family", "familyKey", "size", "par", "updatedAt", "updatedBy"]
};

function shapeForCloud(col, id, data) {
  const allowed = CLOUD_FIELDS[col];
  const now = new Date().toISOString();
  const source = Object.assign({}, data, {
    id,
    updatedAt: now,
    updatedBy: whoName().slice(0, 79)
  });
  if (col === "units") {
    source.lot = String(source.lot || "").slice(0, 39);
    source.expiry = /^\d{4}-\d{2}-\d{2}$/.test(source.expiry || "") ? source.expiry : "";
    source.notes = String(source.notes || "").slice(0, 499);
    source.hospitalId = String(source.hospitalId || "").slice(0, 79);
    source.sku = String(source.sku || "").slice(0, 39);
    source.serial = String(source.serial || "").slice(0, 79);
    source.createdAt = String(source.createdAt || now).slice(0, 39);
    if (!["in-stock", "used", "in-transit", "quarantine"].includes(source.status)) source.status = "in-stock";
  }
  if (col === "events") {
    source.at = String(source.at || now).slice(0, 39);
    source.text = String(source.text || "").slice(0, 499);
    source.by = String(source.by || "").slice(0, 79);
  }
  if (col === "hospitals") {
    source.name = String(source.name || "").slice(0, 119);
    source.city = String(source.city || "").slice(0, 79);
    source.region = String(source.region || "").slice(0, 79);
    source.custom = true;
  }
  if (col === "pars") {
    source.hospitalId = String(source.hospitalId || "").slice(0, 79);
    source.family = String(source.family || "").slice(0, 39);
    source.familyKey = (typeof familyKey === "function" ? familyKey(source.family) : String(source.familyKey || "")).slice(0, 40);
    source.size = String(source.size || "").slice(0, 8);
    const par = parseInt(source.par, 10);
    source.par = Number.isFinite(par) ? Math.max(0, Math.min(99, par)) : 0;
  }
  const payload = {};
  (allowed || Object.keys(source)).forEach((key) => {
    if (source[key] !== undefined) payload[key] = source[key];
  });
  return payload;
}

async function cloudUpsert(col, id, data) {
  saveLocalOnly();
  if (!cloud.live) return;
  const payload = shapeForCloud(col, id, data);
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
    } else if (cloud.user && !cloud.isMember) {
      pill.textContent = "Not on team list";
      pill.className = "pill bad";
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
    } else if (cloud.user && !cloud.isMember) {
      status.textContent = "Signed in as " + (cloud.email || cloud.user.email || "this account") + ", but this email is not on the team list yet.";
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
    for (const par of state.pars || []) {
      await cloudUpsert("pars", par.id, par);
      if (typeof clearPendingPar === "function") clearPendingPar(par.id);
    }
    for (const id of (state.sync.pendingParDeleteIds || []).slice()) {
      await cloudDelete("pars", id);
      if (typeof clearPendingParDelete === "function") clearPendingParDelete(id);
    }
    cloud.localOnly = 0;
    saveLocalOnly();
    const parCount = (state.pars || []).length;
    toast("Uploaded " + count + " units" + (parCount ? " and " + parCount + " par levels" : "") + " to the shared list");
    setLiveUi();
  } catch (e) {
    saveLocalOnly();
    toast(e.message || "Upload failed");
  }
}
