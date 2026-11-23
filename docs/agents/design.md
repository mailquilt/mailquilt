# Designing and building UI

Mailquilt's first product principle is polish that matches the paid tools (`docs/product.md`). A screen that is clean but generic doesn't meet it. This page sets the bar, the process, and the checklist every UI change passes before it's called done.

## The bar

- **Start from a concept, not from components.** The brand already has one: a quilt of envelope blocks, sent through your own provider. Carry it through type, layout, illustration and motion. A stock sidebar plus a checklist plus a card grid is not a design on its own.
- **Every screen has one job.** Before drawing it, write down who arrives there, in what state, what they need to know, and what they do next.
- **Content is design.** Every heading, label and sentence is specific and true. Name things the way users think of them, in `GLOSSARY.md` terms.
- **Never promise what isn't built.** A section that doesn't work yet is shown as coming, or left out. It is never filled with placeholders that look real.
- **Never draw a guess.** A screen waits for what it needs rather than drawing a state and changing it a moment later. "Not loaded yet" is never shown as "you have none".
- **Ask "would a senior designer sign this?",** not "is it clean?".

## Process

1. **UX first.** Write down the screen's job, who arrives and in what state, every state it has (loading, empty, error, success, disabled), and its copy, before any styling.
2. **Mock up anything new, then stop.** Every new screen, component, menu, dialog or sheet is shown as rendered mockups before it is built: desktop and phone, light and dark, every state from step 1. Show two or three directions with a recommendation, and wait for the maintainer's pick. This holds on a `ready-for-agent` ticket too. Only copy, spacing and token changes inside an existing component skip this step.
3. **Question every default.** For each Kumo component the design uses, check how it renders on a phone, where it sits, its type sizes, its focus and its motion. Keep a default only when it is right for this screen, and say which ones you kept. Defaults that cost a round on #6 and the redesign (#69):
   - Kumo pins `Dialog` near the top of the window, and `LayerDialog` puts its desktop card inside the phone drawer.
   - `LayerDialog` focuses its own frame when it opens, not its field, and takes no `initialFocus` or `finalFocus`, nor does Kumo's `Dialog`.
   - `LayerDialog`'s window has no z-index, so above the dark scrim it would sit under it, and its body keeps its padding when empty.
   - Kumo's dialog backdrop is a pale wash that greys out the ink frame. Overriding its `opacity` stops its fade; override only its colour.
   - Kumo's loading `Button` disables itself, and the browser then drops keyboard focus to the page, even inside a dialog.
   - A dialog given a new `key` in the same render that opens it mounts already open and skips its entrance; one keyed by `open` unmounts as it closes and skips its exit. Use `useDialog` (`src/layout/action-dialog.tsx`).
   - Kumo inputs are 14px at every size, so Safari on iPhone and iPad zooms into them.
   - Menu radio items stay open after a click (`closeOnClick` is off).
   - A loading `Button`'s accessible name includes its spinner's label.
   - Kumo bundles its own copy of Base UI, so importing `@base-ui/react` ships a second one.
4. **Build** with the dashboard's tokens and building blocks (`apps/dashboard/README.md`, "Design"). Use the `frontend-design` skill for visual direction and the `kumo-design` skill for the rules of the component system.
   - The picked mockup is the visual spec. The build, or a later move onto Kumo, matches it screen by screen, and any visible difference fails unless it's named as better. Don't redesign while porting.
   - Use Kumo where it serves the design, at its default sizes, with the smallest override that works. Never wrap content in a Kumo container, such as `LayerCard`, just because it's there.
5. **Review** against the `kumo-design` rules and the checklist below. Where a rule is deliberately broken, the code or this page says why. A correctness review (`code-review`) is not a design review.
6. **Make the evidence and look at it, to find faults.** Before calling UI done, produce and inspect:
   - screenshots at 320, 390, 768, 1024, 1440, 1920 and 2560 px wide, in light and dark, for every state, including errors. The 768–1279 px range is the one most often missed. The wide screens matter too: a layout that looks right at 1440 can stretch badly on a wide monitor, as Providers did, and nobody saw it because nothing was checked above 1920;
   - every dialog, sheet and menu open, on a phone and on desktop;
   - a frame-by-frame recording of the screen loading with 120 ms of network latency, in which nothing already drawn moves or changes;
   - focus and keyboard paths checked in a real browser with real clicks and keys. Component tests run in happy-dom, where a scripted click doesn't move focus as a person's does;
   - motion, such as every open and close animation and scrim fade, checked frame by frame in the working build.

   The `dashboard-screens` skill makes all of these. Tests passing is not evidence of design, and neither are screenshots alone: on the redesign (#69) several bugs passed in screenshots and showed only in the working build.

7. **Get a fresh design review.** Give a reviewer agent that hasn't seen your work this page, the brand docs, the `kumo-design` and `frontend-design` skills, the code and the evidence, but not your conclusions. Fix each finding or say why it stays. On #6 this found seven defects the author's own review had passed.
8. **Say what was checked in the pull request:** each checklist item with what showed it, what the design review found and what changed. Images go in only when a human reviewer needs to see a visual change, such as a before and after; attach them by hand. The value is in making and inspecting them, not in attaching them.

## Brand

The official logo kit is in `docs/brand/` (see its README). Copies of the files the dashboard uses are in `apps/dashboard/public/` and `apps/dashboard/src/brand/`. Use these files as they are; never redraw, recolour, stretch or rearrange the logo.

- **Colours:** ink `#111113`, accent `#D4380F`, quilt grey `#71717A`. The dashboard's light and dark values for each live in `apps/dashboard/src/styles.css`.
- **Type:** Space Grotesk for display headings, Instrument Sans for everything else.
- **The frame:** every signed-in page is one light block set into the plain ink frame; the quilt is kept for the sign-in pages. Page titles use the wordmark's two tones ("Contacts **12,480**"). The navigation uses one icon per page from `apps/dashboard/src/icons/icons.tsx`: the current page is highlighted, and an unbuilt page has a dimmed icon and "Soon".
- **Primary actions are ink.** The accent is close to error red, so it is kept for brand moments (the logo, the quilt, a cost) and the single next step.
- **Destructive confirmations are danger red.** The button that confirms something that can't be undone, such as deleting a connection, is danger red (`ActionDialog`'s `destructive`), so the final step is the strongest warning, as the red menu item before it was. It is flat `--mq-danger-button` (`#b91c1c`, 6.5:1 with white), not Kumo's lighter gradient, and not the accent.
- **Quilting stays in the pictures; the words stay plain.** No sewing puns in the copy.

## Review checklist

Run this on every UI change, and explain each finding in plain words: what a user would see go wrong, not only the name of the rule.

1. **UI states:** loading, empty, error, success and disabled are all handled. Try long names and emails, missing data, back and refresh, redirects and double submits.
2. **Accessibility (WCAG 2.2 AA):**
   - One `<main>` per page and a sensible heading order.
   - Every control has a name and a label. Errors are tied to their fields and announced.
   - Keyboard focus is visible, and everything works with keys alone.
   - When the focused element becomes inert or unmounts, such as the phone navigation or a menu closing, or Try again swapping for a loader, focus moves somewhere on purpose. Otherwise it drops to the page, and a keyboard user starts again from the top. Review caught this four times on the redesign (#69).
   - Text contrast is at least 4.5:1; icons and borders at least 3:1.
   - Targets are at least 24 px.
   - Motion respects reduced motion. Decorative graphics are hidden from screen readers.
3. **Responsive:** the widths above, with no sideways scroll. A page that reads as one column, such as a form, settings or Providers, is capped at the form width and centred on wide screens, never left-aligned with an empty gap on the right. Tables keep the page's full width.
4. **Theming:** light and dark both use design tokens. No hard-coded colours or one-off sizes; add a token instead.
5. **Reuse and structure:**
   - Repeated markup or logic becomes one component or hook.
   - Each component has one job, a small props API, and no dead code.
   - Names say what things are.
6. **React and types:** no needless casts. Effects clean up and have the right dependencies. Keys are stable, and hooks follow the rules.
7. **Performance:** watch what each font, icon set and library adds to the bundle. A new dependency states its cost: the gzipped JavaScript total from a build before and after. Avoid needless re-renders. Animate `transform` and `opacity` only.
8. **Privacy and security:** no personal data in URLs or logs. External links use `rel="noopener noreferrer"`. No open redirects.
9. **Copy:** plain and true, with the same name for an action everywhere it appears. Nothing on screen promises a feature that doesn't exist.
10. **Tests:** behaviour tests at the right level (`docs/agents/testing.md`), each seen failing without its code.

Check each finding against the code before reporting it. For an independent read, give a fresh reviewer the code and this checklist, not your own conclusions.
