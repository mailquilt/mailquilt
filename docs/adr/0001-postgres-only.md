# Postgres is the only database, including on Cloudflare

Mailquilt runs either fully on Cloudflare or anywhere with Docker, but it supports only one database: Postgres. Cloudflare deployments reach it through Hyperdrive or a serverless Postgres (Neon, Supabase and similar), while still using R2, Queues and Cron Triggers. We chose this over supporting D1 alongside Postgres because one Drizzle schema cannot target both dialects, so dual support would double every schema, migration, query and test. D1's limits (10 GB per database, 100 bound parameters per query) also land exactly where an email platform is heavy: bulk recipient writes and delivery event volume.

## Considered Options

- **Postgres and D1 both**: rejected for the doubled data-layer cost above.
- **SQLite everywhere (D1 on Cloudflare, a SQLite file in Docker)**: rejected because it limits scaling to one server and runs analytics over large event tables poorly.

## Consequences

Repositories are still Effect services behind interfaces, so a D1 adapter could be added later if there is real demand, but nothing is built for it now.
