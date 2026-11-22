---
name: dashboard-screens
description: Screenshots and load recordings of the Mailquilt dashboard, as the evidence docs/agents/design.md requires before UI work is done. Use whenever you change or review anything in apps/dashboard, or are asked for screenshots, the screenshot matrix, phone screenshots, dark mode screenshots, a load recording, a filmstrip, or to check a screen for flashing, layout shift or a dialog on a phone.
---

# Dashboard screens

Makes the evidence `docs/agents/design.md` asks for: the screenshot matrix (every width, light and dark), dialogs, sheets and menus open, and a frame-by-frame recording of a screen loading. The scripts drive headless Chrome with no extra dependencies. Set `CHROME_PATH` if Chrome isn't at its usual place.

## 1. Run the app

In its own terminal, from the repository root:

```bash
pnpm --filter dashboard build          # the server serves dashboard/dist/client
(cd apps/server && set -a && . ./.env && set +a && node src/main.ts)
```

`apps/server/.env` is local only. It needs `DATABASE_URL` (the `mailquilt-postgres` container), `APP_URL=http://localhost:3000`, `AUTH_SECRET`, `ENCRYPTION_KEYS` (`1:` followed by `openssl rand -base64 32`) and `PORT`. Migrate a fresh database with `pnpm --filter @repo/db migrate`. Rebuild the dashboard after every change you want to see.

## 2. Sign in

A fresh database has no accounts, and every signed-out page sends you to first-run setup (`/setup`). The account it makes is the instance admin, already verified, so it can sign in at once. Setup runs only once per database.

Sign-up is closed until the instance admin opens it in Instance settings (`/instance`). A second account made through sign-up needs its email verified; without a System Mailer, nothing is sent, so verify it by hand:

```bash
docker exec mailquilt-postgres psql -U postgres -d mailquilt \
  -c "update users set email_verified = true where email = 'someone@example.com'"
```

Then get a session for the scripts. Sign-in allows 5 tries a minute per IP, so do it once and reuse the value:

```bash
S="$(git rev-parse --show-toplevel)/.claude/skills/dashboard-screens/scripts"
export MAILQUILT_SESSION=$(node $S/session.mjs --email you@example.com --password '…')
```

Set up the data each state needs through the API with that cookie (for example, no Organization, one, and several with a long name).

## 3. Take the evidence

```bash
# Every width in light and dark, with a contact sheet <name>-matrix.png
node $S/screens.mjs --out /tmp/shots --name home --path /

# With steps first, run in order: click=<selector or text=Label>, type=<text>, press=Enter|Escape|Tab
node $S/screens.mjs --out /tmp/shots --name switcher --step 'click=[aria-label^="Organization:"]'
node $S/screens.mjs --out /tmp/shots --name new-org-error --widths 390,1440 \
  --step 'click=[aria-label^="Organization:"]' --step 'click=text=New organization' \
  --step 'press=Enter'

# An error state: block a request the screen makes, as if it failed (here the
# session check, which every signed-in page makes); --wait covers any retries
# before the error shows
node $S/screens.mjs --out /tmp/shots --name session-failed --block '*/api/auth/get-session' --wait 3000

# Every frame painted while the screen loads, with 120 ms of latency
node $S/filmstrip.mjs --out /tmp/shots --name home-load --path / --width 1280
```

- Widths default to 320, 390, 768, 1024, 1440 and 1920. Phones (below 700 px) are emulated as mobile, so dialogs open as sheets.
- Clicks are real mouse clicks at the element's centre, and keys are real key presses, so focus moves as it does for a person. Each line of output names what has focus in that shot: use it to check focus paths (where focus goes when a dialog opens and closes, after a submit, after an error).
- `text=Label` matches only buttons, links and menu items. Reach a field with a CSS selector instead, such as `click=input[type=email]`.
- `text=Label` matches the start of an element's text, so a menu row whose text continues ("Bolt WeeklyOwner") is found.
- The scripts refuse to click Sign out, Delete, Remove or Revoke, so a run can't end the session or delete data. Sign-in is rate-limited, so a lost session costs a wait.
- A run stops with a message, and saves nothing for that shot, when the app can't be reached or a click matches nothing, so a wrong screen is never saved as evidence. Each shot's Chrome and its temporary profile are removed afterwards.
- A request the page retries (TanStack Query retries three times by default) needs a longer `--wait` before its error shows.

On phones the sidebar is a sheet, so anything in it (the Organization switcher, the account menu, navigation) is only reachable once the sheet is open. Shoot phones separately and open it first, as a person would, or the screenshot shows a menu no one can see:

```bash
node $S/screens.mjs --out /tmp/shots --name switcher-phone --widths 320,390 \
  --step 'click=[aria-label="Open navigation"]' --step 'click=[aria-label^="Organization:"]'
```

## 4. Look, to find faults

Open every image yourself. You are looking for what is wrong, not confirming that it works:

- **Filmstrip:** after the first full frame, nothing may appear, disappear, move or change state. A placeholder that becomes a different layout, a section that pops in, or a heading that re-wraps when a font arrives is a flash to fix.
- **Matrix:** text that wraps or is cut off, controls that change size between rows, elements that don't line up with their neighbours, and anything that looks like an unexamined Kumo default (see "Question every default" in design.md).
- **Phone:** dialogs are sheets with full-width actions, fields are 16 px, and nothing sits under the iPhone home indicator.

Then hand the evidence to a fresh design reviewer (design.md, step 7), and in the pull request say what was checked and what was found. Attach images only where a reviewer needs to see a visual change.
