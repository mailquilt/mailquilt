# Dashboard

The Mailquilt dashboard: a static single-page app built with TanStack Start in SPA mode, Kumo on Tailwind v4, and TanStack Query. It has no server of its own. It talks only to the API, through the typed client generated from `@repo/contract` (`src/api.ts`).

## Develop

```bash
pnpm --filter server dev     # the API on http://localhost:3000
pnpm --filter dashboard dev  # the dashboard on http://localhost:3001
```

`vite dev` forwards `/api/*` and `/health` to the API on `http://localhost:3000` (`server.proxy` in `vite.config.ts`). The port is fixed: if 3001 is taken, `vite dev` stops instead of picking another.

## Design

The bar, the process, the brand rules and the review checklist are in [`docs/agents/design.md`](../../docs/agents/design.md); the full logo kit is in [`docs/brand/`](../../docs/brand/). This section covers how the dashboard puts them into practice.

- **Theme:** `src/styles.css` sets Kumo's colour tokens for light and dark (`data-theme="mailquilt"` on `<html>`), plus the `text-display*` type sizes and the quilt radii. Use those tokens, not one-off values. Two things to know before changing it:
  - Kumo declares its tokens on `:root` outside any cascade layer, so overrides of them must be unlayered too. Inside `@layer` they lose.
  - Kumo's primary button brings its own gradient and text colour. `styles.css` replaces them, and adds a visible focus outline to every Kumo button, in `@layer base` with `!important`.
- **Signed-out pages** (`src/layout/auth-layout.tsx`):
  - The form sits beside a Flying Geese quilt (`src/brand/flying-geese-quilt.tsx`). A goose is the logo's envelope flap, and the orange column is a campaign going out. It lights up from the bottom once, unless reduced motion is on.
  - The label sewn onto the quilt states the cost in plain numbers.
- **Signed-in pages** (`src/layout/app-shell.tsx`): Kumo's sidebar with the full navigation, each section dimmed until it exists. Pages own their own layout under `src/routes/_app/`.
- **Organizations** (`src/organizations/`): `useOrganizations()` gives the signed-in person's Organizations and the one this tab works in; pass `active.id` to every call for that Organization's data. The choice is remembered per tab, so two tabs can work in two Organizations ([ADR 0007](../../docs/adr/0007-tenant-endpoints-name-the-organization-in-the-path.md)). The switcher sits at the top of the sidebar; the home page's first step names the first Organization.
- **Organization patches** (`src/organizations/organization-patch.tsx`): each Organization is drawn as a 2×2 patch of the logo's ink and greys, arranged by its ID, so it keeps its patch when renamed. The logo's dashed slot always means a piece that isn't there yet (the next step, "New organization"), never a divider.
- **Page area:** every signed-in page's content sits in `PageFrame` (`src/layout/page-frame.tsx`), which `TablePage` and the form pages share, so they line up.
- **Dialogs** with one action use `ActionDialog` (`src/layout/action-dialog.tsx`). One that confirms something that can't be undone passes `destructive`, which draws its action in the danger colour. On desktop it is Kumo's `LayerDialog`, centred, with the content on a raised card and the actions on the frame. On phones it is a sheet from the bottom edge, built on Base UI's Drawer, because Kumo's own phone layout puts the desktop card inside the drawer. A form inside it is submitted by the action through the form's `id`.
- **Forms** use TanStack Form and check their values with the schemas in `@repo/domain` (`Schema.toStandardSchemaV1`), the same ones the API uses, so a rule is written once. Each form sets `noValidate` and submits through `submitForm` (`src/forms/submit-form.ts`), which moves focus to the first field with an error. Every text field is a `FormField` (`src/forms/form-field.tsx`): Kumo's label, input and error, with the error tied to the input and announced again on every submit.
- **Fields on phones and touch screens** use 16px text (`max-sm:text-lg pointer-coarse:text-lg`, applied by `FormField`), because Safari on iPhone and iPad zooms the page into any field smaller than that, including in landscape, where the desktop layout shows.
- **Tables** (`src/audience/data-table.tsx`): headless TanStack Table (`@tanstack/react-table` 9) drawn with Kumo's `Table`, with a compact header and hairline rows instead of Kumo's alternating fill, so a selected row's tint and a status column read cleanly. Columns are defined with TanStack's column helper, so later columns (custom fields, sorting, column visibility) are features to register, not a rewrite. A column's layout classes go in `columnClassNames` by its id; how a value looks belongs in its cell. On phones a table scrolls sideways with its first columns pinned (`shadow-pinned-column` marks the edge).
- **Table pages** (`src/layout/table-page.tsx`, `src/audience/table-card.tsx`): heading, description and actions above, then one card with an optional toolbar, the table or a state in its place (`TableEmpty` with the logo's missing piece, `TableLoadFailed` with Try again), and an optional footer. While the next page or filter loads, the last rows stay, dimmed, under a line (`busy`), so the table never empties and refills.
- **Filters and pages live in the URL** through TanStack Router's search params, decoded with an Effect schema that drops any part it can't read (`src/audience/contact-search.ts`), so a reload, the back button or a shared link shows the same rows. Paging is Previous and Next over the API's cursors (ADR 0008), with the range and total beside them; Kumo's `Pagination` isn't used, because it counts pages by number and its simple mode shows unlabelled arrows.
- **Subscription status** (`src/audience/subscription-status.tsx`) is drawn with the logo's blocks and always written beside: ink is subscribed, the dashed slot is pending, pale is unsubscribed.
- **Checkboxes and radios:** `styles.css` rings Kumo's unchecked ones in `--mq-patch-grey`, because Kumo's hairline ring is under the 3:1 contrast a control's boundary needs.
- **Loading:** a screen never draws a guess and changes it a moment later. Signed-in pages wait on `PageLoading` (`src/layout/page-states.tsx`) until the session and the Organizations list have loaded, and `PageLoadFailed` offers Try again when either can't be loaded. A page that loads its own data waits on `PageAreaLoading` in the page area, beside the sidebar, and draws once.
- **Who sees what:** `SignedInOnly` and `SignedOutOnly` (`src/layout/session-gates.tsx`) send people to the right side of the app. `useAccount()` gives signed-in pages the account without asking for the session again.
- **Verification links:** sending one always goes through `useSendVerificationLink` (`src/auth/send-verification-link.ts`), with one action name, "Send a new link".
- **Progress:** steps are marked with `StepBlock` (`src/brand/quilt-block.tsx`), drawn in the logo's language: an ink block with a check is done, the orange block lifted off its dashed slot is next, and a grey block is still to come.
- **Providers** (`src/providers/`): each Provider Connection is a card with its server, encryption and sender, and a test email built in. A test's result is drawn in the logo's language: an ink block with a check when the Provider accepted the email, the empty dashed slot with the server's own words when it didn't. Connecting and editing are full pages, not dialogs, because the form is long. A mutation writes its result straight into the cached list before refetching, so the page navigated to next never draws the old list. Kumo's loading `Button` disables itself and drops keyboard focus, so a button that can be pressed again (Send test email, Connect, Save changes) changes its label instead.
- **The accent is used sparingly:** for brand moments (the logo, the quilt, the cost) and the single next step, never for ordinary actions. Primary actions are ink, because the accent sits next to error red.
- **Every screen has one job,** and its copy tells people what to do next. See `check-your-inbox` and the setup steps on the home page.

## Build

```bash
pnpm --filter dashboard build
```

The static files are written to `dist/client`, with the app shell as `index.html`. Both entry apps serve them next to the API: `apps/server` through `HttpStaticServer`, and `apps/api-worker` through Workers static assets (`assets` in `wrangler.jsonc`). A browser asking for a page that isn't a file or an API route gets `index.html`, so the router handles it in the browser. On Node that fallback applies only to paths without a file extension, so dashboard routes never end in one (`/campaigns/cmp_…`, not `/export.csv`). API routes live under `/api` ([ADR 0004](../../docs/adr/0004-api-routes-live-under-api.md)).

## Test

```bash
pnpm --filter dashboard test
```
