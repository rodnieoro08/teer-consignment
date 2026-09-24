# TEER Consignment

Phone-first stock board for Abbott TEER consignment across UK hospitals.

Built for field specialists who currently keep serials in Excel and need to know, before a case, whether a site has NT / NTW / XT / XTW or a steerable guide.

Not official Abbott software. Not CE / UKCA marked. Not the system of record.
Do not upload live serial numbers, lot numbers, or patient details into this GitHub repo.

## Live URL

After GitHub Pages is on:

https://rodnieoro08.github.io/teer-consignment/

On iPhone: open in Safari → Share → Add to Home Screen.

## What it does

- UK TEER centre list preloaded (Barts, Brompton, Papworth, Wythenshawe, Leeds, etc.)
- Product catalogue for MitraClip G4 / G5 CDS, SGC and bundles
- Camera / photo / typed serial capture, including GS1 UDI `(21)` `(17)` `(10)`
- National search: who has an XTW?
- Per-hospital clip matrix and expiry flags
- Mark used, borrow / transfer between hospitals
- JSON snapshot for colleagues + CSV back to Excel
- Optional pull from a hosted JSON URL (private gist raw link, JSONBin, SharePoint)

## Team workflow

1. One person owns the live snapshot (usually the covering specialist).
2. After a stock check or case, **Team → Export JSON**.
3. Drop the file in the private team channel.
4. Colleagues open the app → **Team → Import**. Serials merge. Same serial updates in place.
5. If you later host that JSON at a URL, paste it in **Snapshot URL** and tap **Pull**.

Data stays in the browser (`localStorage`). Clearing Safari data clears the stock on that phone.

## Enable GitHub Pages

1. Open the repo on GitHub.
2. Settings → Pages → Deploy from branch `main`, folder `/ (root)`.
3. Wait a minute, then open the URL above and refresh.

## Files

Keep these in the repo root:

- `index.html`
- `app.js`
- `data.js`
- `styles.css`
- `manifest.json`
- `sw.js`
- `icon.svg`

## Adding SKUs or hospitals

Edit `data.js`. Reload the app. Existing serials are untouched.

## Demo data

First launch loads dummy serials so Find / matrix work immediately.
**Team → Reload demo stock** or **Clear local stock** before you type real numbers.
