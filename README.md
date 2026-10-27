# TEER Consignment

Phone-first stock board for Abbott TEER consignment across UK hospitals, with a **private shared Firebase list** so every specialist sees adds, uses and transfers in real time.

Not official Abbott software. Not CE / UKCA marked. Not the system of record.
Do not upload live serial numbers, lot numbers, patient details, or your Firebase config into this GitHub repo.

## Live URL

https://rodnieoro08.github.io/teer-consignment/

On iPhone: Safari → Share → Add to Home Screen.

## One-time setup (you do this once)

Firebase is free on the Spark plan and stays in *your* Google account. The app cannot create the project for you. Publish the rules before you share the config. Until your email is on the team list, the shared stock stays closed.

1. Open [https://console.firebase.google.com](https://console.firebase.google.com) and sign in with a work Google account.
2. **Add project** → name it e.g. `uk-teer-consignment` → disable Analytics if you want.
3. Gear → **Project settings** → **Your apps** → web (`</>`) → nickname `teer-stock` → register. Copy the `firebaseConfig` object.
4. Build → **Authentication** → Get started → enable **Email/Password** and **Google**.
5. Authentication → **Settings** → **Authorized domains** → add `rodnieoro08.github.io`.
6. Build → **Firestore Database** → Create database → **Production mode** → pick `europe-west2` (London).
7. Firestore → **Rules** → paste the contents of `firestore.rules` from this repo → Publish.
8. Open the app → **Team** → paste `firebaseConfig` → **Save config on this phone**. If you change the config later, the app reconnects. If it cannot, reload the page.
9. Enter your name, email and password → **Create login**, then **Sign in**. **Create login** only registers the password. It does not open the stock list.
10. On **Team list**, tap **Claim first admin** once, before anyone else with the config can. That writes your email into `members` and locks the seat with `meta/bootstrap`.
11. Add each colleague's email (and Admin only for people who should manage the list).
12. Tap **Upload this phone to the shared list** once, so colleagues are not looking at an empty database. Signing in does not delete units that exist only on this phone.
13. Send colleagues the app URL and the same `firebaseConfig` text (WhatsApp or Teams, not GitHub). They create a login with the email you added, then sign in. The header pill reads **Live**.

You can do steps 10 and 11 from the Firebase console instead of the phone. In Firestore, add a document in `members` whose ID is the lowercase email, with fields `email` (string), `name` (string), `role` (`admin` or `member`), `active` (boolean true), `updatedAt` and `updatedBy` (strings). Also add `meta/bootstrap` with `claimed` true and `email` set to the first admin, so nobody else can claim that seat.

After that, a scan or transfer on your phone appears on theirs within a second.

## How the shared list works

- Only emails on the `members` list can read or change stock, hospitals and presence. Admins add or remove people from the phone or the console.
- The activity log is append-only. Members can add an event. Nobody can edit or delete one from the app, so it stays usable as an audit trail.
- Each edit stores who changed it. Rules check the shape of the fields (status, lengths, dates).
- Presence shows who is currently in the app. You can only write your own presence row.
- The phone keeps a local copy, so Find still works with no signal after the app has been opened online once. The service worker then serves the page, Firebase and the barcode reader from cache if the network does not answer within a few seconds. Edits made while signed out are merged back when you are next online.
- JSON / CSV export remains as a backup.

## What is private

- Firestore data is **not** in the GitHub repo.
- The web config is shareable inside the team, but it is not enough on its own. Firestore rejects any signed-in account whose email is not on the team list.
- Do not publish the config. If it leaks, rotate the web API key in Google Cloud, remove unexpected emails from `members`, and check Authentication for accounts you do not recognise. Creating a login is still possible for anyone who has the config; the team list is what actually grants access.

## Enable GitHub Pages

Settings → Pages → Deploy from branch `main`, folder `/ (root)`.

## Files

- `index.html` `app.js` `cloud.js` `data.js` `styles.css` `manifest.json` `sw.js` `icon.svg`
- `firestore.rules` — paste into the Firebase console
