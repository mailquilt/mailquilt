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

`pnpm dev` runs each app's dev task, including the Node server on port 3000 and the dashboard's dev server on port 3001, which sends `/api` to it. Open the dashboard at http://localhost:3001. The server needs a Postgres and the settings `compose.yaml` describes, in your shell before you run it. For example:

```sh
docker run -d --name mailquilt-dev-db -p 5432:5432 \
  -e POSTGRES_USER=mailquilt -e POSTGRES_PASSWORD=dev -e POSTGRES_DB=mailquilt \
  postgres:18.7-alpine

export DATABASE_URL=postgres://mailquilt:dev@localhost:5432/mailquilt
export APP_URL=http://localhost:3001
export AUTH_SECRET="$(openssl rand -base64 32)"
export ENCRYPTION_KEYS="1:$(openssl rand -base64 32)"
```

`APP_URL` is the address you open: the server refuses signed-in changes from any other origin. Keep `AUTH_SECRET` and `ENCRYPTION_KEYS` the same between runs, or you're signed out and saved Provider credentials can't be read. Turborepo passes only the settings listed under `server#dev` in `turbo.json` to the server, so a new setting goes in that list too.

Read [docs/agents/testing.md](docs/agents/testing.md) before you write or change tests.

## Dependencies

- Every version is pinned exactly in the catalog in `pnpm-workspace.yaml`. Packages refer to it with `catalog:`.
- pnpm refuses releases younger than 7 days (`minimumReleaseAge`). An exception goes in `minimumReleaseAgeExclude` with its reason.
- Dependencies are updated by hand, in their own pull request, never inside a feature pull request.

## Pull requests

- One behaviour per pull request. A second behaviour is a second pull request.
- Fill in the pull request template, including how you know the change works.
- Every CI check must pass before a merge: lint, type-check, tests, the two smoke tests (Docker and Cloudflare), `pnpm audit`, CodeQL, the secret scan and the CLA check. Nobody merges around a failed or unfinished check.
- A maintainer reviews the change as [docs/agents/review.md](docs/agents/review.md) describes.

## Contributor License Agreement

Before your first pull request can merge, you accept the [Contributor License Agreement](CLA.md). The CLA Assistant bot comments on the pull request with a link, and you accept by signing in with GitHub. It covers all your later contributions too.

You keep the copyright in your contribution. You give the maintainer a license to use it, including the right to release it under other licenses. Mailquilt's core is licensed under AGPL-3.0, and that right keeps a commercial license possible alongside it.
