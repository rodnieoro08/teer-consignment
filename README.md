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
10. On **Team list**, tap **Claim first admin** once, before anyone else with the config can. That saves your admin row and the `meta/bootstrap` lock in one step. A second person cannot take the seat.
11. Add each colleague's email (and Admin only for people who should manage the list).
12. Tap **Upload this phone to the shared list** once, so colleagues are not looking at an empty database. Signing in does not delete units that exist only on this phone.
13. Send colleagues the app URL and the same `firebaseConfig` text (WhatsApp or Teams, not GitHub). They create a login with the email you added, then sign in. The header pill reads **Live**.

Step 10 has to be done in the app. The rules accept the first admin only when the member row and `meta/bootstrap` are written together, so a second person cannot slip in between two separate saves. After that seat is taken, you can add colleagues from the phone or the Firebase console: a document in `members` whose ID is the lowercase email, with `email`, `name`, `role` (`admin` or `member`), `active` true, `updatedAt` and `updatedBy`. Leave `meta/bootstrap` alone. It is the lock, and the rules do not allow it to be edited or deleted.

After that, a scan or transfer on your phone appears on theirs within a second.

## How the shared list works

- Only emails on the `members` list can read or change stock, hospitals and presence. Admins add or remove people from the phone or the console.
- Only an admin can delete a unit. The delete and an activity line are saved together. Events stay append-only: nobody can edit or delete one, so the log stays usable as an audit trail.
- Each serial can exist only once on the shared list. Saving a unit also writes a `serials` lock for that serial. Shared serials use letters, numbers, dots, underscores and hyphens.
- **Erase units on this phone** clears the copy on the phone and does not delete the shared list. It is available after you sign out, because the shared list would otherwise refill the phone straight away.
- A JSON backup includes units, par levels and the phone settings needed to move phones (name, team, last hospital, last SKU). It does not include the Firebase config. Older backups without par levels still import.
- Each edit stores who changed it. Rules check the shape of the fields (status, lengths, dates).
- Presence shows who is currently in the app. You can only write your own presence row.
- The phone keeps a local copy, so Find still works with no signal after the app has been opened online once. The service worker then serves the page, Firebase and the barcode reader from cache if the network does not answer within a few seconds. Edits made while signed out are merged back when you are next online.
- JSON / CSV export remains as a backup. CSV import matches a hospital only when the name matches after ignoring case, punctuation and extra spaces. If it does not match, you choose a hospital, create one, or skip the row. The city is never used as a guess.

## What is private

- Firestore data is **not** in the GitHub repo.
- The web config is shareable inside the team, but it is not enough on its own. Firestore rejects any signed-in account whose email is not on the team list.
- Do not publish the config. If it leaks, rotate the web API key in Google Cloud, remove unexpected emails from `members`, and check Authentication for accounts you do not recognise. Creating a login is still possible for anyone who has the config; the team list is what actually grants access.

## Tests

`npm test` runs the unit tests without Firebase. `npm run test:rules` starts the Firestore emulator (Java required, no Firebase login) and checks that only one first admin can claim the seat, that a serial cannot be saved twice, and that only an admin can delete a unit, together with an activity line. The project id `teer-rules-test` is only the local emulator name. It is not a live Firebase project.

## Enable GitHub Pages

Settings → Pages → Deploy from branch `main`, folder `/ (root)`.

## TriClip and par levels

The board keeps MitraClip G3, G4 and G5, and TriClip G4 and G5, in separate matrices. Delivery systems and bundles of the same size count together. Set a par on a hospital (0 means that size is not stocked there). Below-par and at-zero lines can be exported or shared. Par levels sync with the signed-in team.

TriClip catalogue numbers are the EU MDR codes published by Abbott. Verified GTINs are mapped in `scan-fix.js`. TriClip G5 EU GTINs were not in the public sources used here, so those barcodes are not mapped.

## Files

- `index.html` `app.js` `cloud.js` `data.js` `pars.js` `hospital-match.js` `backup.js` `gs1.js` `csv.js` `styles.css` `manifest.json` `sw.js` `icon.svg` `apple-touch-icon.png` `favicon.ico`
- `firestore.rules` — paste into the Firebase console
