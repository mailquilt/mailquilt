Closes #

## What changes

<!-- What this does, in a few lines. A small diff, tree or sketch helps more than prose. -->

## How you know it works

<!-- The tests you added, at which seam, and what you checked by hand. For something visible, a screenshot before and after. -->

## Checklist

- [ ] The change was agreed in the issue above, or it's a small fix
- [ ] `pnpm lint`, `pnpm check-types` and `pnpm test` pass
- [ ] Each new test was seen failing without the change
- [ ] A new endpoint has a case in the cross-Organization isolation suite
- [ ] What the docs, API descriptions and changeset say was checked against the code, not written from memory
- [ ] It says "Breaking" if the API contract, a stored format or the upgrade path changes, and migrations are expand-then-contract
- [ ] Nothing in `docs/agents/decisions.md` or `docs/adr/` is reversed, or this says which and why, and updates it
- [ ] One behaviour changes. A second one is a second pull request

For a change to the dashboard (see `docs/agents/design.md`):

- [ ] The maintainer picked this design from rendered mockups before it was built, or the change is only copy, spacing or tokens
- [ ] Screenshots at every width in light and dark, for every state, are attached, with each dialog, sheet and menu open on a phone and on desktop
- [ ] A load recording is attached, and nothing already drawn moves or changes in it
- [ ] Each item of the design checklist is answered with the screenshot or test that shows it
