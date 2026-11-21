# Designing and building UI

Mailquilt's first product principle is polish that matches the paid tools (`docs/product.md`). A screen that is clean but generic doesn't meet it. This page sets the bar, the process, and the checklist every UI change passes before it's called done.

## The bar

- **Start from a concept, not from components.** The brand already has one: a quilt of envelope blocks, sent through your own provider. Carry it through type, layout, illustration and motion. A stock sidebar plus a checklist plus a card grid is not a design on its own.
- **Every screen has one job.** Before drawing it, write down who arrives there, in what state, what they need to know, and what they do next.
- **Content is design.** Every heading, label and sentence is specific and true. Name things the way users think of them, in `GLOSSARY.md` terms.
- **Never promise what isn't built.** A section that doesn't work yet is shown as coming, or left out. It is never filled with placeholders that look real.
- **Ask "would a senior designer sign this?",** not "is it clean?".

## Process

1. **UX first.** Write the screen's job, its states and its copy before any styling.
2. **Mock up a change of direction.** A new visual direction, or a redesign of an existing screen, is shown as rendered mockups for the maintainer to pick from before it is built. Small changes inside an agreed direction don't need one.
3. **Build** with the dashboard's tokens and building blocks (`apps/dashboard/README.md`, "Design"). Use the `frontend-design` skill for visual direction and the `kumo-design` skill for the rules of the component system.
4. **Review** against the `kumo-design` rules and the checklist below. Where a rule is deliberately broken, the code or this page says why.
5. **Look at it.** Take screenshots at 320, 390, 768, 1024 and 1440 px wide, plus one wider screen, in light and dark. The 768–1279 px range is the one most often missed.

## Brand

The official logo kit is in `docs/brand/` (see its README). Copies of the files the dashboard uses are in `apps/dashboard/public/` and `apps/dashboard/src/brand/`. Use these files as they are; never redraw, recolour, stretch or rearrange the logo.

- **Colours:** ink `#111113`, accent `#D4380F`, quilt grey `#71717A`. The dashboard's light and dark values for each live in `apps/dashboard/src/styles.css`.
- **Type:** Space Grotesk for display headings, Instrument Sans for everything else.
- **Primary actions are ink.** The accent is close to error red, so it is kept for brand moments (the logo, the quilt, a cost) and the single next step.
- **Quilting stays in the pictures; the words stay plain.** No sewing puns in the copy.

## Review checklist

Run this on every UI change, and explain each finding in plain words: what a user would see go wrong, not only the name of the rule.

1. **UI states:** loading, empty, error, success and disabled are all handled. Try long names and emails, missing data, back and refresh, redirects and double submits.
2. **Accessibility (WCAG 2.2 AA):**
   - One `<main>` per page and a sensible heading order.
   - Every control has a name and a label. Errors are tied to their fields and announced.
   - Keyboard focus is visible, and everything works with keys alone.
   - Text contrast is at least 4.5:1; icons and borders at least 3:1.
   - Targets are at least 24 px.
   - Motion respects reduced motion. Decorative graphics are hidden from screen readers.
3. **Responsive:** the widths above, with no sideways scroll.
4. **Theming:** light and dark both use design tokens. No hard-coded colours or one-off sizes; add a token instead.
5. **Reuse and structure:**
   - Repeated markup or logic becomes one component or hook.
   - Each component has one job, a small props API, and no dead code.
   - Names say what things are.
6. **React and types:** no needless casts. Effects clean up and have the right dependencies. Keys are stable, and hooks follow the rules.
7. **Performance:** watch what each font, icon set and library adds to the bundle. Avoid needless re-renders. Animate `transform` and `opacity` only.
8. **Privacy and security:** no personal data in URLs or logs. External links use `rel="noopener noreferrer"`. No open redirects.
9. **Copy:** plain and true, with the same name for an action everywhere it appears. Nothing on screen promises a feature that doesn't exist.
10. **Tests:** behaviour tests at the right level (`docs/agents/testing.md`), each seen failing without its code.

Check each finding against the code before reporting it. For an independent read, give a fresh reviewer the code and this checklist, not your own conclusions.
