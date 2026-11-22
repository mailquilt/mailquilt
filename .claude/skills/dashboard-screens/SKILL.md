---
name: dashboard-screens
description: Screenshots and load recordings of the Mailquilt dashboard, as the evidence docs/agents/design.md requires before UI work is done. Use whenever you change or review anything in apps/dashboard, or are asked for screenshots, the screenshot matrix, phone screenshots, dark mode screenshots, a load recording, a filmstrip, or to check a screen for flashing, layout shift or a dialog on a phone.
---

# Dashboard screens

Makes the evidence `docs/agents/design.md` asks for: the screenshot matrix (every width, light and dark), dialogs, sheets and menus open, and a frame-by-frame recording of a screen loading. The scripts drive headless Chrome with no extra dependencies. Set `CHROME_PATH` if Chrome isn't at its usual place.

## 1. Run the app

```bash
pnpm --filter dashboard build          # the server serves dashboard/dist/client
cd apps/server && set -a && . ./.env && set +a && node src/main.ts
```

`apps/server/.env` is local only. It needs `DATABASE_URL` (the `mailquilt-postgres` container), `APP_URL=http://localhost:3000`, `AUTH_SECRET` and `PORT`. Migrate a fresh database with `pnpm --filter @repo/db migrate`. Rebuild the dashboard after every change you want to see.

## 2. Sign in

Make an account through the dashboard's sign-up page. Locally no email is sent, so verify it by hand:

```bash
docker exec mailquilt-postgres psql -U postgres -d mailquilt \
  -c "update users set email_verified = true where email = 'you@example.com'"
```

Then get a session for the scripts. Sign-in allows 5 tries a minute per IP, so do it once and reuse the value:

```bash
S=.claude/skills/dashboard-screens/scripts
export MAILQUILT_SESSION=$(node $S/session.mjs --email you@example.com --password '…')
```

Set up the data each state needs through the API with that cookie (for example, no Organization, one, and several with a long name).

## 3. Take the evidence

```bash
# Every width in light and dark, with a contact sheet <name>-matrix.png
node $S/screens.mjs --out /tmp/shots --name home --path /

# The same with something open: a selector, or text=Label for a button or menu item
node $S/screens.mjs --out /tmp/shots --name switcher --click '[aria-label^="Organization:"]'
node $S/screens.mjs --out /tmp/shots --name new-org \
  --click '[aria-label^="Organization:"]' --click 'text=New organization'

# Every frame painted while the screen loads, with 120 ms of latency
node $S/filmstrip.mjs --out /tmp/shots --name home-load --path / --width 1280
```

Widths default to 320, 390, 768, 1024, 1440 and 1920. Phones (below 700 px) are emulated as mobile, so dialogs open as sheets.

On phones the sidebar is a sheet, so anything in it (the Organization switcher, the account menu, navigation) is only reachable once the sheet is open. Shoot phones separately and open it first, as a person would, or the screenshot shows a menu no one can see:

```bash
node $S/screens.mjs --out /tmp/shots --name switcher-phone --widths 320,390 \
  --click '[aria-label="Open navigation"]' --click '[aria-label^="Organization:"]'
```

## 4. Look, to find faults

Open every image yourself. You are looking for what is wrong, not confirming that it works:

- **Filmstrip:** after the first full frame, nothing may appear, disappear, move or change state. A placeholder that becomes a different layout, a section that pops in, or a heading that re-wraps when a font arrives is a flash to fix.
- **Matrix:** text that wraps or is cut off, controls that change size between rows, elements that don't line up with their neighbours, and anything that looks like an unexamined Kumo default (see "Question every default" in design.md).
- **Phone:** dialogs are sheets with full-width actions, fields are 16 px, and nothing sits under the iPhone home indicator.

Attach the matrix and filmstrip PNGs to the pull request, and answer each design.md checklist item with the image or test that shows it.
