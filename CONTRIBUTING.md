# Contributing to Mailquilt

Thanks for helping. This page covers how to propose a change, set up the repo and get a pull request merged.

Everyone taking part follows the [code of conduct](CODE_OF_CONDUCT.md). Report security problems privately, as [SECURITY.md](SECURITY.md) describes, never in a public issue.

## Before you write code

- Find or open an issue first. For anything beyond a small fix, agree on the approach there before you write it.
- Read [docs/architecture.md](docs/architecture.md), [docs/security.md](docs/security.md) and the ADRs in [docs/adr/](docs/adr/) for the area you touch. Terms such as Contact, Campaign and Provider Connection are defined in [GLOSSARY.md](GLOSSARY.md).
- Settled decisions are listed in [docs/agents/decisions.md](docs/agents/decisions.md). A change that reverses one says so and gives the reason.

## Setting up

You need Node 24, pnpm (the version in `packageManager` in `package.json`) and Docker, which the tests use to start Postgres.

```sh
pnpm install
pnpm dev          # run the apps
pnpm check        # lint and formatting (Ultracite)
pnpm fix          # fix what can be fixed automatically
pnpm check-types  # type-check every package
pnpm test         # run the tests
```

Read [docs/agents/testing.md](docs/agents/testing.md) before you write or change tests.

## Dependencies

- Every version is pinned exactly in the catalog in `pnpm-workspace.yaml`. Packages refer to it with `catalog:`.
- pnpm refuses releases younger than 7 days (`minimumReleaseAge`). An exception goes in `minimumReleaseAgeExclude` with its reason.
- Renovate opens grouped update pull requests every week. Don't update dependencies in a feature pull request.

## Pull requests

- One behaviour per pull request. A second behaviour is a second pull request.
- Fill in the pull request template, including how you know the change works.
- Every CI check must pass before a merge: lint, type-check, tests, `pnpm audit`, CodeQL, the secret scan and the CLA check. Nobody merges around a failed or unfinished check.
- A maintainer reviews the change as [docs/agents/review.md](docs/agents/review.md) describes.

## Contributor License Agreement

Before your first pull request can merge, you accept the [Contributor License Agreement](CLA.md). The CLA Assistant bot comments on the pull request with a link, and you accept by signing in with GitHub. It covers all your later contributions too.

You keep the copyright in your contribution. You give the maintainer a license to use it, including the right to release it under other licenses. Mailquilt's core is licensed under AGPL-3.0, and that right keeps a commercial license possible alongside it.
