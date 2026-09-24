const FB_KEY = "teer-consign-fb";
const cloud = {
  app: null,
  auth: null,
  db: null,
  user: null,
  live: false,
  people: [],
  lastError: "",
  unsub: []
};

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

async function initCloud() {
  const cfg = loadFbConfig();
  setLiveUi();
  if (!cfg || !window.firebase) return;
  try {
    if (!firebase.apps.length) cloud.app = firebase.initializeApp(cfg);
    else cloud.app = firebase.app();
    cloud.auth = firebase.auth();
    cloud.db = firebase.firestore();
    try { cloud.db.enablePersistence({ synchronizeTabs: true }); } catch (_) {}
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
  } catch (e) {
    cloud.lastError = e.message;
    setLiveUi();
  }
}

function saveLocalOnly() {
  localStorage.setItem(KEY, JSON.stringify({
    units: state.units,
    events: state.events.slice(0, 300),
    settings: state.settings,
    hospitalsExtra: state.hospitals.filter(h => h.custom)
  }));
}

async function startLive() {
  stopLive();
  cloud.live = true;
  listenCol("units", (rows) => {
    state.units = rows;
    saveLocalOnly();
    refresh();
  });
  listenCol("events", (rows) => {
    rows.sort((a, b) => (b.at || "").localeCompare(a.at || ""));
    state.events = rows.slice(0, 300);
    saveLocalOnly();
    refresh();
  });
  listenCol("hospitals", (rows) => {
    rows.forEach(h => {
      if (!state.hospitals.find(x => x.id === h.id)) state.hospitals.push(Object.assign({ custom: true }, h));
    });
    fillSelects();
    refresh();
  });
  listenCol("presence", (rows) => {
    const cutoff = Date.now() - 120000;
    cloud.people = rows.filter(p => (p.ts || 0) > cutoff);
    setLiveUi();
  });
  await beatPresence();
  if (cloud._beat) clearInterval(cloud._beat);
  cloud._beat = setInterval(beatPresence, 25000);
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
  Object.keys(obj).forEach((k) => {
    if (obj[k] !== undefined) out[k] = obj[k];
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
    } else if (cfg && cloud.auth) {
      status.textContent = "Firebase is configured. Sign in so edits reach the rest of the team.";
    } else {
      status.textContent = "Not live yet. One person creates a free Firebase project, pastes the config below, then the team signs in.";
    }
    if (cloud.lastError) status.textContent += " Last error: " + cloud.lastError;
  }
  if (people) {
    people.innerHTML = cloud.people.length
      ? cloud.people.map(p => `<span class="chip in">${p.name || p.email || "Colleague"}</span>`).join("")
      : `<span class="tiny">${cloud.live ? "Only you right now" : "Nobody live"}</span>`;
  }
  const signed = document.getElementById("signed-as");
  if (signed) signed.textContent = cloud.user ? (cloud.user.email || cloud.user.uid) : "Not signed in";
}

async function pushLocalUp() {
  if (!cloud.live) { toast("Sign in first"); return; }
  for (const u of state.units) await cloudUpsert("units", u.id, u);
  for (const h of state.hospitals.filter(x => x.custom)) await cloudUpsert("hospitals", h.id, h);
  if (state.events[0]) await cloudUpsert("events", crypto.randomUUID(), state.events[0]);
  toast("Uploaded this phone onto the shared list");
}
