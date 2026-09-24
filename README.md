# TEER Consignment

Phone-first stock board for Abbott TEER consignment across UK hospitals, with a **private shared Firebase list** so every specialist sees adds, uses and transfers in real time.

Not official Abbott software. Not CE / UKCA marked. Not the system of record.
Do not upload live serial numbers, lot numbers, patient details, or your Firebase config into this GitHub repo.

## Live URL

https://rodnieoro08.github.io/teer-consignment/

On iPhone: Safari → Share → Add to Home Screen.

## One-time setup (you do this once)

Firebase is free on the Spark plan and stays in *your* Google account. The app cannot create the project for you.

1. Open [https://console.firebase.google.com](https://console.firebase.google.com) and sign in with a work Google account.
2. **Add project** → name it e.g. `uk-teer-consignment` → disable Analytics if you want.
3. Gear → **Project settings** → **Your apps** → web (`</>`) → nickname `teer-stock` → register. Copy the `firebaseConfig` object.
4. Build → **Authentication** → Get started → enable **Email/Password** and **Google**.
5. Authentication → **Settings** → **Authorized domains** → add `rodnieoro08.github.io`.
6. Build → **Firestore Database** → Create database → **Production mode** → pick `europe-west2` (London).
7. Firestore → **Rules** → paste the contents of `firestore.rules` from this repo → Publish.
8. Open the app → **Team** → paste `firebaseConfig` → **Save config on this phone**.
9. Enter your name, email and password → **Create team account** (first person) or **Sign in**.
10. Tap **Upload this phone to the shared list** once, so colleagues are not looking at an empty database.
11. Send colleagues: the app URL, the same `firebaseConfig` text (WhatsApp/Teams, not GitHub), and tell them to create their own account.

After that, a scan or transfer on your phone appears on theirs within a second. Header pill reads **Live**.

## How the shared list works

- Signed-in users read and write `units`, `events` and extra hospitals.
- Each edit stores who changed it.
- Presence shows who is currently in the app.
- The phone still keeps a local cache, so Find works in a basement; it syncs when the signal returns.
- JSON / CSV export remains as a backup.

## What is private

- Firestore data is **not** in the GitHub repo.
- Only people who have *both* your Firebase config **and** a signed-in account can see serials.
- Do not publish the config. If it leaks, rotate the web API key in Google Cloud and recreate accounts.

Optional tighter lock: in Authentication create users yourself and turn off “Create team account” by telling the team not to use it.

## Enable GitHub Pages

Settings → Pages → Deploy from branch `main`, folder `/ (root)`.

## Files

- `index.html` `app.js` `cloud.js` `data.js` `styles.css` `manifest.json` `sw.js` `icon.svg`
- `firestore.rules` — paste into the Firebase console
