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
