import { PgClient } from "@effect/sql-pg";
import { PostgreSqlContainer } from "@testcontainers/postgresql";
import { Context, Effect, Layer, Redacted } from "effect";
import { SqlClient } from "effect/sql";

const POSTGRES_IMAGE =
  "postgres:18.7-alpine@sha256:ff64c9e3bdf8e2120107d3559de8db314e8305f7e38c5105903c6295876738ff";

/** The connection URL of a real Postgres from Testcontainers, as its superuser. */
export class PostgresUrl extends Context.Service<PostgresUrl, string>()(
  "test/PostgresUrl"
) {}

export const PostgresLive = Layer.effect(
  PostgresUrl,
  Effect.acquireRelease(
    Effect.promise(() => new PostgreSqlContainer(POSTGRES_IMAGE).start()),
    (container) => Effect.promise(() => container.stop())
  ).pipe(Effect.map((container) => container.getConnectionUri()))
);

let databases = 0;

/** A new, empty database in that Postgres, so each test starts from nothing. Returns its URL. */
export const emptyDatabase = Effect.gen(function* emptyDatabase() {
  const url = yield* PostgresUrl;
  databases += 1;
  const name = `test_${databases}`;

  yield* Effect.gen(function* createDatabase() {
    const sql = yield* SqlClient.SqlClient;
    yield* sql.unsafe(`create database ${name}`);
  }).pipe(Effect.provide(PgClient.layer({ url: Redacted.make(url) })));

  const database = new URL(url);
  database.pathname = `/${name}`;

  return database.toString();
});
