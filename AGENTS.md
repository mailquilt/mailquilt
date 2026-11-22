<!-- BEGIN:turborepo-agent-rules -->

# This is NOT the Turborepo you know

Turborepo configuration, task behavior, and CLI commands can vary between installed versions and may differ from your training data. Resolve the `turbo` package from this file's directory or relevant workspace; in monorepos, it may not be visible from the repository root. For example, run `node -p "require.resolve('turbo/package.json')"` from a workspace that depends on `turbo`.

Read `docs/README.md` inside that installed package first, then read the relevant pages from its `docs/` directory before changing Turborepo configuration or commands. Heed deprecation notices. These bundled docs match the installed package version and are available without network access.

This block is written and re-added by `turbo` before repository-scoped commands when an AI agent is detected. In the Turborepo source repository, its template is defined in `crates/turborepo-cli/src/cli/agent_guidance.rs`. Removing the managed block while updates are enabled means a later qualifying invocation will add it again. Set `"agentGuidance": true` in the root `turbo.json` or `turbo.jsonc` to opt in; this does not remove an existing block. Keep the block committed with your work to avoid an uncommitted change on the next agent invocation.
<!-- END:turborepo-agent-rules -->

## Agent skills

### Issue tracker

Issues are tracked in GitHub Issues for `mailquilt/mailquilt` via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Uses the default label vocabulary (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `GLOSSARY.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.

### Before building

Read `docs/architecture.md`, `docs/security.md` and the ADRs for the area you touch. Follow the pattern an ADR or existing code already sets. If a ticket needs a new pattern that other code will copy, such as a new port, error shape or way of scoping, write a short ADR for it before using it a second time.

### Tests

Before writing or changing tests, read `docs/agents/testing.md`.

### Reviews

Before reviewing code, or acting on a review, read `docs/agents/review.md`. It says which kind of review to run, the bar a finding must meet, and when to stop. Decisions already taken are in `docs/agents/decisions.md`. Don't raise them again unless something has changed since.

### Design and UI

Before designing or changing any screen, read `docs/agents/design.md`. It sets the quality bar, the process, the brand rules, and the checklist every UI change passes. Design with the `frontend-design` skill, and build and review with the `kumo-design` skill. The dashboard's tokens and building blocks are described in `apps/dashboard/README.md`.

Two gates apply to every ticket, `ready-for-agent` ones included:

- **Stop at mockups.** Any new screen, component, menu, dialog or sheet is shown as rendered mockups (desktop and phone, light and dark, every state) and waits for the maintainer's pick before any code. Only copy, spacing and token changes inside an existing component skip this.
- **Done means checked.** UI is done only after the evidence `docs/agents/design.md` lists has been made and inspected (the screenshot matrix, dialogs and menus open on a phone, a load recording, focus checked in a real browser) and a fresh design reviewer has worked through it. The pull request says what was checked and found. Make the evidence with the `dashboard-screens` skill.

### Running commands

In a shell without a terminal (TTY), `turbo run` can finish and then hang, because `turbo.json` uses the interactive UI. Run `./node_modules/.bin/turbo run <task> --ui=stream`, and call tools such as `tsc`, `vitest` and `ultracite` from `node_modules/.bin` rather than through `pnpm exec`.

### Merging

One behaviour per pull request. Merge only after every check has passed, never around a failed or unfinished check, and in each area merge one pull request at a time, each reviewed against the bar first.

# Ultracite Code Standards

This project uses **Ultracite**, a zero-config preset that enforces strict code quality standards through automated formatting and linting.

## Quick Reference

- **Format code**: `pnpm exec ultracite fix`
- **Check for issues**: `pnpm exec ultracite check`
- **Diagnose setup**: `pnpm exec ultracite doctor`

Oxlint + Oxfmt (the underlying engine) provides robust linting and formatting. Most issues are automatically fixable.

---

## Core Principles

Write code that is **accessible, performant, type-safe, and maintainable**. Focus on clarity and explicit intent over brevity.

### Type Safety & Explicitness

- Use explicit types for function parameters and return values when they enhance clarity
- Prefer `unknown` over `any` when the type is genuinely unknown
- Use const assertions (`as const`) for immutable values and literal types
- Leverage TypeScript's type narrowing instead of type assertions
- Use meaningful variable names instead of magic numbers - extract constants with descriptive names

### Modern JavaScript/TypeScript

- Write functions as arrow functions assigned to `const`, and define them above where they're used
- Prefer `for...of` loops over `.forEach()` and indexed `for` loops
- Use optional chaining (`?.`) and nullish coalescing (`??`) for safer property access
- Prefer template literals over string concatenation
- Use destructuring for object and array assignments
- Use `const` by default, `let` only when reassignment is needed, never `var`

### Async & Promises

- Always `await` promises in async functions - don't forget to use the return value
- Use `async/await` syntax instead of promise chains for better readability
- Handle errors appropriately in async code with try-catch blocks
- Don't use async functions as Promise executors

### React & JSX

- Use function components over class components
- Call hooks at the top level only, never conditionally
- When a hook dependency rule fires, first check whether the effect is needed, and whether adding the dependency changes when it runs
- Use the `key` prop for elements in iterables (prefer unique IDs over array indices)
- Nest children between opening and closing tags instead of passing as props
- Don't define components inside other components
- In JSX, work out a multi-way condition in a variable or helper above the `return`, not in a chain of ternaries

### Accessibility

- Use semantic HTML first; add ARIA only when no native element fits
- Provide meaningful alt text for images
- Use proper heading hierarchy
- Add labels for form inputs
- Make anything clickable a `<button>` or a link, so it works from the keyboard; don't add key handlers to a `<div>`
- Use semantic elements (`<button>`, `<nav>`, etc.) instead of divs with roles

### Error Handling & Debugging

- Remove `console.log`, `debugger`, and `alert` statements from production code
- Throw `Error` objects with descriptive messages, not strings or other values
- Use `try-catch` blocks meaningfully - don't catch errors just to rethrow them
- Prefer early returns over nested conditionals for error cases

### Code Organization

- Keep functions focused and under reasonable cognitive complexity limits
- Extract complex conditions into well-named boolean variables
- Use early returns to reduce nesting, and put braces around every `if` body, including a one-line guard
- Use a single ternary for a choice between two values. For three or more outcomes, use early returns or a lookup; never nest ternaries
- Group related code together and separate concerns
- Avoid import cycles; move shared code into a module both sides import
- Don't leave TODO or FIXME comments in new code. For an existing one, do the task, delete it if it's done, or leave it; never reword it to get past the linter

### Security

- Add `rel="noopener noreferrer"` when using `target="_blank"` on links
- Avoid `dangerouslySetInnerHTML` unless absolutely necessary
- Don't use `eval()` or assign directly to `document.cookie`
- Validate and sanitize user input

### Performance

- Avoid spread syntax in accumulators within loops
- Use top-level regex literals instead of creating them in loops
- Avoid barrel files (index files that only re-export other modules) inside an app; a package's entry point is fine
- Use proper image components (e.g., Next.js `<Image>`) over `<img>` tags

### Framework-Specific Guidance

**Next.js:**

- Use Next.js `<Image>` component for images
- Use `next/head` or App Router metadata API for head elements
- Use Server Components for async data fetching instead of async Client Components

**React 19+:**

- Use ref as a prop instead of `React.forwardRef`

**Solid/Svelte/Vue/Qwik:**

- Use `class` and `for` attributes (not `className` or `htmlFor`)

---

## Testing

- Write assertions inside `it()` or `test()` blocks
- Avoid done callbacks in async tests - use async/await instead
- Don't use `.only` or `.skip` in committed code
- Keep test suites reasonably flat - avoid excessive `describe` nesting

## When Oxlint + Oxfmt Can't Help

Oxlint + Oxfmt will catch most mechanical issues automatically. Focus your attention on:

1. **Business logic correctness** - Oxlint + Oxfmt can't validate your algorithms
2. **Meaningful naming** - Use descriptive names for functions, variables, and types
3. **Architecture decisions** - Component structure, data flow, and API design
4. **Edge cases** - Handle boundary conditions and error states
5. **User experience** - Accessibility, performance, and usability considerations
6. **Documentation** - Add comments for complex logic, but prefer self-documenting code

---

Most formatting and common issues are automatically fixed by Oxlint + Oxfmt. Run `pnpm exec ultracite fix` before committing to ensure compliance.
