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

## TriClip and par levels

The board keeps MitraClip G3, G4 and G5, and TriClip G4 and G5, in separate matrices. Delivery systems and bundles of the same size count together. Set a par on a hospital (0 means that size is not stocked there). Below-par and at-zero lines can be exported or shared. Par levels sync with the signed-in team.

TriClip catalogue numbers are the EU MDR codes published by Abbott. Verified GTINs are mapped in `scan-fix.js`. TriClip G5 EU GTINs were not in the public sources used here, so those barcodes are not mapped.

## On the way to a case

The home counts open Find already filtered: everything in stock, what expires inside 90 or 30 days (soonest first), or the sites that currently hold stock. Size chips (XTW, NTW, and the rest) do the same for one size. Family chips on Find keep MitraClip and TriClip, and G4 and G5, apart. Shortages and missing guides sit above the matrix. Marking a unit used can be undone from the toast, and a used unit can be put back in stock.

Tap a matrix number to see those units. A red zero, or any cell under par, lists who else has that size. Spare means the other hospital stays at or above its own par after one unit leaves.

A site with loose clip delivery systems and no steerable guide is flagged **Needs a guide**. A bundle includes its own guide, so it does not cover a loose clip. The reorder export and share text include both the short lines and these missing guides.

Find can narrow by family, size, expiry, and status, including in transit and quarantine. Sites can show only shelves with stock, lines below par, or a missing guide. The scan screen keeps the last few hospitals as chips.

## Case day, transfers and stock checks

- **Expired stock is not stock.** A unit past its expiry stays on the list but is not counted in the matrix, against a par level, or as something another hospital could lend. The matrix shows it as `+1 exp`, and Home lists expired units to quarantine or return. A unit that expires today still counts.
- **My sites.** Open a hospital and tap **Pin to Home**. Pinned hospitals sit at the top of Home with what is ready to use per size. Pins are kept on your phone only.
- **Use first.** Where a shelf has two or more of the same size with different dates, the earliest is marked **Use first**.
- **Scan knows the box.** If a scanned or typed serial is already on the list, the scan screen shows where it is and offers **Mark used in case**, **Move to** the chosen hospital, or **Mark received**. A barcode that only carries the serial no longer blanks a lot or expiry already on file.
- **Barcodes the app does not know.** If a barcode does not say which product it is, the scan screen asks you to check the REF. Once you add the unit, this phone remembers that barcode for the next box (Team → Forget learned barcodes to undo).
- **In transit.** A transfer can be sent as **in transit**. The unit counts as stock nowhere until someone at the other end marks it received, by tapping it or scanning it. Short lines show what is on the way.
- **Stock check.** Open a hospital → **Stock check**, then scan every box on the shelf. Each one is ticked off. Anything not found is listed as missing, and anything extra can be moved or added on the spot. The result goes into the activity log and can be shared. A check survives closing the app.
- **Used in cases.** Marking a unit used stamps the date in its notes (`Used 2026-11-23`). Home → **Usage report** lists what was used in the last 7, 30 or 90 days by hospital, to share or export for replacement orders.
- **Share stock list.** A hospital's shelf, with serials, lots and expiry dates, as text for a message.
- **Example stock.** The demo units are labelled, are never uploaded, and are removed when you sign in to the shared list.

None of this changes the Firestore fields, so `firestore.rules` does not need republishing.

## Tests

`node --test test/*.test.js` on the Mac. There is no CI.

## Files

- `index.html` `app.js` `flows.js` `stock.js` `cloud.js` `data.js` `pars.js` `gs1.js` `csv.js` `styles.css` `manifest.json` `sw.js` `icon.svg` `apple-touch-icon.png`
- `firestore.rules` — paste into the Firebase console
