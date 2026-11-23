# Every dashboard icon comes from one module

The dashboard draws its icons with Hugeicons, from one file, `apps/dashboard/src/icons/icons.tsx`. That includes the icons Kumo draws inside its own components, such as the Select arrow, the Checkbox tick, a menu's submenu arrow and the navigation drawer's close button.

Kumo draws those with Phosphor, which it imports by name (`import { CaretDownIcon } from "@phosphor-icons/react"`) and doesn't let us swap through its props. So the dashboard's Vite and Vitest configs alias `@phosphor-icons/react` to the icon module (`apps/dashboard/icon-alias.ts`), and the module exports each icon under its Phosphor name, accepting Phosphor's props (`size`, `weight`, `color`, `mirrored`, `alt`) and its `IconContext`. Kumo then draws our icons without knowing it, and our own code imports from the same module, so changing an icon is one line.

Hugeicons' free set has one stroke style, so a Phosphor weight sets the stroke width (`bold` and `fill` draw a heavier stroke). Phosphor stays installed for its types only: Kumo's props are typed with Phosphor's `Icon`, and type imports aren't aliased.

## Considered Options

- **Kumo's icon props:** some parts take a custom icon (`Button`, `DropdownMenu` items, `Sidebar.MenuButton`, `Breadcrumbs`, `Banner`), but the Select arrow, Checkbox tick, submenu arrow and drawer close don't. The app would draw two icon styles side by side.
- **Rebuilding those parts on Base UI,** which Kumo re-exports: it works, but it drifts from Kumo and costs far more than one module.
- **Keeping Phosphor:** one style with no alias, but not the look the maintainer chose.

## Consequences

- To change any icon, ours or Kumo's, change its line in `icons.tsx`. Import icons from there, never from `@phosphor-icons/react` or `@hugeicons/*` directly.
- **After a Kumo upgrade,** `src/icons/icons.test.tsx` reads Kumo's built files and fails, naming each icon Kumo imports that the module doesn't map yet. Add those names, choosing the closest Hugeicon. The production build also fails with `MISSING_EXPORT`.
- Vitest runs Kumo through Vite (`server.deps.inline`), so the alias reaches Kumo in tests as it does in the build. A second test renders a Kumo Checkbox and checks its tick is ours.
- Kumo's toast embeds its own copy of five Phosphor icons that no import reaches. The dashboard's toasts render their own content and hide Kumo's close button, so those icons are never drawn; they stay in the bundle as unused code.
