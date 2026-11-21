import { PgClient } from "@effect/sql-pg";
import { MailquiltApi } from "@repo/contract";
import { DatabaseHealthLive, DatabaseLive } from "@repo/db";
import { PostgreSqlContainer } from "@testcontainers/postgresql";
import { Context, Effect, Layer, Redacted } from "effect";
import { FetchHttpClient, HttpRouter, HttpServer } from "effect/http";
import { HttpApiClient } from "effect/http-api";

import { ApiLive } from "../src/index.ts";

const POSTGRES_IMAGE =
  "postgres:18.7-alpine@sha256:ff64c9e3bdf8e2120107d3559de8db314e8305f7e38c5105903c6295876738ff";

const startPostgres = Effect.acquireRelease(
  Effect.promise(() => new PostgreSqlContainer(POSTGRES_IMAGE).start()),
  (container) => Effect.promise(() => container.stop())
);

const appWith = (databaseUrl: string) =>
  ApiLive.pipe(
    HttpRouter.provideRequest(
      DatabaseHealthLive.pipe(
        Layer.provide(DatabaseLive),
        Layer.provide(PgClient.layer({ url: Redacted.make(databaseUrl) }))
      )
    ),
    Layer.provide(HttpServer.layerServices)
  );

/** The typed client generated from `contract`, wired to the app in process. */
export class ApiClient extends Context.Service<
  ApiClient,
  HttpApiClient.ForApi<typeof MailquiltApi>
>()("test/ApiClient") {}

/**
 * The whole API assembled as the entry apps assemble it, with a real Postgres
 * from Testcontainers. Requests go through the same web handler the Worker
 * uses, so routing, encoding and decoding are the real ones.
 */
export const TestApp = Layer.effect(
  ApiClient,
  Effect.gen(function* apiClient() {
    const postgres = yield* startPostgres;

    const app = yield* Effect.acquireRelease(
      Effect.sync(() =>
        HttpRouter.toWebHandler(appWith(postgres.getConnectionUri()), {
          disableLogger: true,
        })
      ),
      (web) => Effect.promise(web.dispose)
    );

    const fetchInProcess: typeof globalThis.fetch = (input, init) =>
      app.handler(new Request(input, init));

    return yield* HttpApiClient.make(MailquiltApi, {
      baseUrl: "http://mailquilt.test",
    }).pipe(
      Effect.provide(FetchHttpClient.layer),
      Effect.provideService(FetchHttpClient.Fetch, fetchInProcess)
    );
  })
);
