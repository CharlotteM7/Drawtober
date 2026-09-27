// Cloud sync for Drawtober Quest, using Firebase Auth (Google sign-in) and Firestore.
//
// How it works
// - The game keeps saving to localStorage exactly as before (app.js). This file mirrors that
//   save to one Firestore document per player: players/{uid} = { state, updatedAt }.
// - Local changes are uploaded a moment after they happen.
// - Changes from your other devices arrive live and replace the game on screen.
// - On sign-in, if this browser has changes that never reached the cloud (played offline,
//   or played before you first signed in), the two saves are merged so nothing is lost.
//   Otherwise the cloud copy wins, so an undo on your phone isn't undone by an old PC copy.
//
// If firebase-config.js is still null, this file does nothing.

import { firebaseConfig } from "./firebase-config.js";

const FIREBASE_VERSION = "12.19.0";
const CDN = `https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}`;
const DIRTY_KEY = "drawtober-quest-unsynced";   // "1" when this browser has changes the cloud hasn't seen
const SYNCED_UID_KEY = "drawtober-quest-synced-uid"; // which account this browser last synced with

/* ---------- pure helpers (no Firebase) ---------- */

// Merge two saves. `preferred` wins where both have something for the same day.
export function mergeStates(preferred, other){
  const a = preferred || {}, b = other || {};
  const aPrompts = Array.isArray(a.prompts) && a.prompts.length ? a.prompts : null;
  const bPrompts = Array.isArray(b.prompts) && b.prompts.length ? b.prompts : null;
  return {
    v: 1,
    prompts: aPrompts || bPrompts,
    days: { ...(b.days || {}), ...(a.days || {}) },
    rolls: { ...(b.rolls || {}), ...(a.rolls || {}) },
  };
}

const same = (x, y) => JSON.stringify(x) === JSON.stringify(y);
const ls = {
  get(k){ try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v){ try { localStorage.setItem(k, v); } catch {} },
};

/* ---------- sync ---------- */

async function start(){
  const game = window.drawtoberQuest;
  const box = document.getElementById("syncBox");
  if (!firebaseConfig || !game || !box) return;
  if (game.testMode) { box.textContent = "Cloud sync is off in test mode"; return; }

  let app, auth, db;
  let fb = {};
  try {
    const [appMod, authMod, fsMod] = await Promise.all([
      import(`${CDN}/firebase-app.js`),
      import(`${CDN}/firebase-auth.js`),
      import(`${CDN}/firebase-firestore.js`),
    ]);
    fb = { ...appMod, ...authMod, ...fsMod };
    app = fb.initializeApp(firebaseConfig);
    auth = fb.getAuth(app);
    db = fb.getFirestore(app);
  } catch (e) {
    console.error("Firebase failed to load", e);
    box.textContent = "Cloud sync unavailable right now";
    return;
  }

  let unsubscribe = null;
  let uid = null;
  let uploadTimer = null;
  let uploading = Promise.resolve();

  const setStatus = t => game.setStatus(t);
  const markDirty = () => ls.set(DIRTY_KEY, "1");

  function renderSignedOut(){
    box.replaceChildren();
    const b = document.createElement("button");
    b.className = "btn ghost";
    b.textContent = "Sign in with Google to sync";
    b.addEventListener("click", signIn);
    box.append(b);
  }
  function renderSignedIn(user){
    box.replaceChildren();
    const who = document.createElement("span");
    who.textContent = `Syncing as ${user.displayName || user.email || "you"}`;
    const out = document.createElement("button");
    out.className = "linkbtn";
    out.textContent = "Sign out";
    out.addEventListener("click", () => fb.signOut(auth));
    box.append(who, out);
  }

  async function signIn(){
    const provider = new fb.GoogleAuthProvider();
    try {
      await fb.signInWithPopup(auth, provider);
    } catch (e) {
      if (e?.code === "auth/popup-closed-by-user" || e?.code === "auth/cancelled-popup-request") return;
      if (e?.code === "auth/popup-blocked" || e?.code === "auth/operation-not-supported-in-this-environment") {
        await fb.signInWithRedirect(auth, provider);
        return;
      }
      console.error("Sign-in failed:", e?.code, e);
      const help = {
        "auth/unauthorized-domain": `Add ${location.hostname} to Firebase → Authentication → Settings → Authorised domains.`,
        "auth/operation-not-allowed": "Turn on Google in Firebase → Authentication → Sign-in method.",
        "auth/configuration-not-found": "Firebase Authentication isn't set up yet: open Authentication, click Get started, then enable Google.",
        "auth/invalid-api-key": "The apiKey in firebase-config.js doesn't match your Firebase project.",
        "auth/api-key-not-valid.-please-pass-a-valid-api-key.": "The apiKey in firebase-config.js doesn't match your Firebase project.",
        "auth/network-request-failed": "Couldn't reach Google. Check your connection and try again.",
      }[e?.code];
      game.toast(help ? `Sign-in didn't work. ${help}` : `Sign-in didn't work (${e?.code || "unknown error"}).`);
    }
  }

  function upload(){
    if (!uid) return;
    const ref = fb.doc(db, "players", uid);
    const state = game.getState();
    setStatus(navigator.onLine ? "Syncing…" : "Offline. Will sync when you're back online");
    uploading = uploading.then(() =>
      fb.setDoc(ref, { state, updatedAt: fb.serverTimestamp() })
    ).then(() => {
      // Only clear the flag if nothing changed while we were uploading.
      if (same(state, game.getState())) ls.set(DIRTY_KEY, "0");
      ls.set(SYNCED_UID_KEY, uid);
      setStatus("Synced to your account");
    }).catch(e => {
      console.error(e);
      setStatus("Saved in this browser. Cloud sync failed");
    });
  }

  // Every local save: remember it's unsynced, then upload shortly after.
  game.onChange(() => {
    markDirty();
    if (!uid) return;
    clearTimeout(uploadTimer);
    uploadTimer = setTimeout(upload, 800);
  });

  async function beginSync(user){
    uid = user.uid;
    renderSignedIn(user);
    setStatus("Syncing…");
    const ref = fb.doc(db, "players", uid);

    try {
      const snap = await fb.getDoc(ref);
      const local = game.getState();
      const remote = snap.exists() ? snap.data().state : null;
      const hasUnsynced = ls.get(DIRTY_KEY) === "1" || ls.get(SYNCED_UID_KEY) !== uid;

      if (!remote) {
        upload(); // first time on this account: this browser's save becomes the cloud save
      } else if (hasUnsynced) {
        const merged = mergeStates(local, remote);
        if (!same(merged, local)) game.replaceState(merged);
        if (!same(merged, remote)) upload();
        else { ls.set(DIRTY_KEY, "0"); ls.set(SYNCED_UID_KEY, uid); setStatus("Synced to your account"); }
      } else {
        if (!same(remote, local)) game.replaceState(remote);
        setStatus("Synced to your account");
      }
    } catch (e) {
      console.error(e);
      setStatus("Saved in this browser. Couldn't reach your account");
      return;
    }

    // Live updates from your other devices.
    unsubscribe = fb.onSnapshot(ref, snap => {
      if (!snap.exists() || snap.metadata.hasPendingWrites) return;
      const remote = snap.data().state;
      if (remote && !same(remote, game.getState()) && ls.get(DIRTY_KEY) !== "1") {
        game.replaceState(remote);
        setStatus("Synced to your account");
      }
    }, e => {
      console.error(e);
      setStatus("Saved in this browser. Live sync stopped");
    });
  }

  function endSync(){
    if (unsubscribe) unsubscribe();
    unsubscribe = null; uid = null;
    clearTimeout(uploadTimer);
    renderSignedOut();
    setStatus("Saved in this browser");
  }

  window.addEventListener("online", () => { if (uid && ls.get(DIRTY_KEY) === "1") upload(); });

  fb.getRedirectResult(auth).catch(() => {});
  fb.onAuthStateChanged(auth, user => { user ? beginSync(user) : endSync(); });
}

start();
