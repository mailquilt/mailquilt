import { Effect, Exit, Schema, Scope } from "effect";
import type { SqlClient, SqlConnection } from "effect/sql";
import {
  CamelCasePlugin,
  CompiledQuery,
  Kysely,
  PostgresAdapter,
  PostgresIntrospector,
  PostgresQueryCompiler,
} from "kysely";
import type { DatabaseConnection, Driver, QueryResult } from "kysely";

type RunPromise = <A, E>(effect: Effect.Effect<A, E>) => Promise<A>;

const RawResult = Schema.Struct({
  rowCount: Schema.Number,
  rows: Schema.Array(Schema.Unknown),
});

const toKyselyConnection = (
  reserved: SqlConnection.Connection,
  runPromise: RunPromise
) =>
  ({
    executeQuery: <R>(query: CompiledQuery) =>
      runPromise(
        reserved
          .executeRaw(query.sql, query.parameters)
          .pipe(Effect.flatMap(Schema.decodeUnknownEffect(RawResult)))
      ).then(
        (raw) =>
          ({
            numAffectedRows: BigInt(raw.rowCount),
            // SAFETY: Kysely types rows by the query it compiled; Postgres returns the columns that query selects.
            rows: raw.rows as R[],
          }) satisfies QueryResult<R>
      ),
    // oxlint-disable-next-line require-yield -- Kysely requires an async iterator; Better Auth never streams.
    async *streamQuery() {
      throw new Error("Streaming is not supported by Better Auth's SQL bridge");
    },
  }) satisfies DatabaseConnection;

const runStatement = async (
  connection: DatabaseConnection,
  statement: string
) => {
  await connection.executeQuery(CompiledQuery.raw(statement));
};

/**
 * A Kysely instance that runs every query on the request's Effect
 * `SqlClient`, for Better Auth's Kysely adapter. Each Kysely connection
 * reserves one connection from the client's pool until Kysely releases it,
 * so a transaction's queries share it. Better Auth's camelCase fields become
 * our snake_case columns.
 */
export const kyselyOnSqlClient = (
  sql: SqlClient.SqlClient,
  runPromise: RunPromise
) => {
  const reservations = new WeakMap<DatabaseConnection, Scope.Closeable>();

  const driver: Driver = {
    acquireConnection: () =>
      runPromise(
        Effect.gen(function* reserveConnection() {
          const scope = yield* Scope.make();

          const reserved = yield* sql.reserve.pipe(
            Scope.provide(scope),
            Effect.onError((cause) => Scope.close(scope, Exit.failCause(cause)))
          );

          const connection = toKyselyConnection(reserved, runPromise);

          reservations.set(connection, scope);

          return connection;
        })
      ),
    beginTransaction: (connection) => runStatement(connection, "begin"),
    commitTransaction: (connection) => runStatement(connection, "commit"),
    destroy: () => Promise.resolve(),
    init: () => Promise.resolve(),
    releaseConnection: (connection) => {
      const scope = reservations.get(connection);
      reservations.delete(connection);

      return scope === undefined
        ? Promise.resolve()
        : runPromise(Scope.close(scope, Exit.void));
    },
    rollbackTransaction: (connection) => runStatement(connection, "rollback"),
  };

  return new Kysely({
    dialect: {
      createAdapter: () => new PostgresAdapter(),
      createDriver: () => driver,
      createIntrospector: (db) => new PostgresIntrospector(db),
      createQueryCompiler: () => new PostgresQueryCompiler(),
    },
    plugins: [new CamelCasePlugin()],
  });
};
