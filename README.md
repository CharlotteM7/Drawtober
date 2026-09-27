# Drawtober Quest

A small web app that turns Drawtober into a game: one prompt a day through October, with XP, levels, streaks, challenge dice and badges.

## Run it

No build step and nothing to install. Open `index.html` in a browser, or serve the folder:

```
npx serve .
```

It also works on GitHub Pages: turn on Pages for this repo and point it at the main branch root.

## How it plays

- **Prompts:** paste your list under *Prompts & data*, one per line. Numbers like `1.` or `Day 1:` are stripped. Until you add them, sample prompts are shown.
- **XP:** 100 for a drawing done on its day, 60 for catching up a missed day.
- **Challenge dice:** roll up to two a day for +25 (easy), +50 (medium) or +75 (hard). Each die can be rerolled once. Before October you can take practice rolls, which aren't saved.
- **Streaks:** +10% XP per on-time day in a row before today, up to +50%. Catch-ups don't repair a streak.
- **Hallowe'en:** day 31 done on the 31st gets +50.
- **Levels:** 10, from Doodler to Drawtober Legend. **Badges:** 14.

## Test mode

Add `?date=YYYY-MM-DD` to the address to pretend it's that day, e.g. `index.html?date=2026-10-01`. A banner shows you're in test mode, with buttons to step a day forward or back. Test progress is saved separately from your real game (`drawtober-quest-test`), and cloud sync is off, so you can't mess up your real save. Remove `?date=…` (or click *Leave test mode*) to go back.

## Data

Progress is always saved in your browser's `localStorage` under `drawtober-quest-v1`. *Download backup* / *Restore from backup* keep a copy you can move anywhere.

## Cloud sync (optional, Firebase)

Sign in with Google and your progress follows you between devices. Until `firebase-config.js` is filled in, the app just saves in the browser and no sign-in button appears.

One-time setup (free Spark plan is plenty):

1. Go to [console.firebase.google.com](https://console.firebase.google.com), **Add project** (e.g. `drawtober-quest`). Analytics can be off.
2. **Build → Authentication → Get started → Sign-in method → Google → Enable**, pick a support email, save.
3. Still in Authentication: **Settings → Authorised domains → Add domain** and add `<your-username>.github.io`. (`localhost` is already there for testing.)
4. **Build → Firestore Database → Create database**. Pick a location near you (e.g. `europe-west2`, London) and start in **production mode**.
5. In Firestore, open the **Rules** tab, replace everything with the contents of `firestore.rules`, and **Publish**. This makes sure only you can read or write your save.
6. **Project settings (cog) → General → Your apps → Web (`</>`)**, register an app (no Hosting needed), and copy the `firebaseConfig` object into `firebase-config.js` in place of `null`.
7. Commit and push. On the live site, click **Sign in with Google to sync**.

The config values in `firebase-config.js` aren't secret, so it's fine for them to be in a public repo. The Firestore rules are what protect your data.

How syncing behaves:

- Every change saves locally first, then uploads to `players/{your user id}` a moment later.
- Changes made on another device show up live.
- If a browser has progress the cloud hasn't seen (played offline, or before you first signed in), the two are merged on sign-in so no drawings are lost.
- Signing out keeps the progress in that browser.

Note: opening `index.html` straight from the folder (`file://`) can't sign in, because Google sign-in needs a real web address. Use the GitHub Pages site, or `npx serve .` and open `http://localhost:3000`.

## Files

- `index.html` – page structure
- `styles.css` – styles, with light and dark themes
- `app.js` – game rules, rendering and local storage
- `sync.js` – optional Firebase sign-in and cloud sync
- `firebase-config.js` – your Firebase project config (`null` = sync off)
- `firestore.rules` – security rules to paste into Firestore
