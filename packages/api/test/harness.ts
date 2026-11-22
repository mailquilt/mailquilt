import { PgClient } from "@effect/sql-pg";
import { MailquiltApi } from "@repo/contract";
import { credentialCipherLayer } from "@repo/core";
import type { SmtpProvider, SystemMailer } from "@repo/core";
import type { SmtpOutbox, SystemMailerOutbox } from "@repo/core/testing";
import {
  RecordingSmtpProviderLive,
  SystemMailerOutboxLive,
} from "@repo/core/testing";
import { DatabaseLive, DatabasePortsLive } from "@repo/db";
import { migrateDatabase } from "@repo/db/migrate";
import { PostgreSqlContainer } from "@testcontainers/postgresql";
import { Context, Effect, Layer, Option, Redacted } from "effect";
import { FetchHttpClient, HttpRouter, HttpServer } from "effect/http";
import { HttpApiClient } from "effect/http-api";

import { ApiLive, authConfigLayer } from "../src/index.ts";

const POSTGRES_IMAGE =
  "postgres:18.7-alpine@sha256:ff64c9e3bdf8e2120107d3559de8db314e8305f7e38c5105903c6295876738ff";

/** The app's origin in tests. */
export const APP_URL = "http://mailquilt.test";

/** The header the test deployment's proxy puts the client IP in, configured as an operator might write it. */
export const TRUSTED_IP_HEADER = "X-Real-IP";

/** Signs session cookies and verification links in tests. */
export const TEST_AUTH_SECRET = Redacted.make(
  "test-secret-that-is-at-least-32-characters-long"
);

const TestAuthConfig = authConfigLayer({
  appUrl: APP_URL,
  clientIpHeader: Option.some(TRUSTED_IP_HEADER),
  secret: TEST_AUTH_SECRET,
});

/** Seals Provider Connection credentials in tests: key 1, 32 bytes of 7s. */
export const TEST_ENCRYPTION_KEYS = Redacted.make(
  "1:BwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwc="
);

const startPostgres = Effect.acquireRelease(
  Effect.promise(() => new PostgreSqlContainer(POSTGRES_IMAGE).start()),
  (container) => Effect.promise(() => container.stop())
);

const appWith = (
  databaseUrl: string,
  fakes: Context.Context<
    SystemMailer | SystemMailerOutbox | SmtpProvider | SmtpOutbox
  >
) =>
  ApiLive.pipe(
    HttpRouter.provideRequest(
      Layer.mergeAll(
        DatabasePortsLive.pipe(
          Layer.provideMerge(
            PgClient.layer({ url: Redacted.make(databaseUrl) })
          ),
          Layer.provide(credentialCipherLayer(TEST_ENCRYPTION_KEYS))
        ),
        TestAuthConfig,
        Layer.succeedContext(fakes)
      )
    ),
    Layer.provide(HttpServer.layerServices)
  );

/** The typed client generated from `contract`, wired to the app in process. */
export class ApiClient extends Context.Service<
  ApiClient,
  HttpApiClient.ForApi<typeof MailquiltApi>
>()("test/ApiClient") {}

/** Plain `fetch` to the app in process, for routes outside `contract`. */
export const AppFetch =
  Context.Service<typeof globalThis.fetch>("test/AppFetch");

/**
 * The whole API assembled as the entry apps assemble it, with a migrated,
 * real Postgres from Testcontainers, the System Mailer outbox and the
 * recording SMTP Provider. Its
 * `SqlClient` reaches that Postgres directly, to set up states no endpoint
 * can make yet; tests still check results through the API. Requests go
 * through the same web handler the Worker uses, so routing, encoding and
 * decoding are the real ones.
 */
export const TestApp = Layer.effectContext(
  Effect.gen(function* testApp() {
    const postgres = yield* startPostgres;
    const databaseUrl = postgres.getConnectionUri();

    yield* migrateDatabase.pipe(
      Effect.provide(DatabaseLive),
      Effect.provide(PgClient.layer({ url: Redacted.make(databaseUrl) }))
    );

    const fakes = yield* Layer.build(
      Layer.mergeAll(SystemMailerOutboxLive, RecordingSmtpProviderLive)
    );

    const database = yield* Layer.build(
      PgClient.layer({ url: Redacted.make(databaseUrl) })
    );

    const app = yield* Effect.acquireRelease(
      Effect.sync(() =>
        HttpRouter.toWebHandler(appWith(databaseUrl, fakes), {
          disableLogger: true,
        })
      ),
      (web) => Effect.promise(web.dispose)
    );

    const fetchInProcess: typeof globalThis.fetch = (input, init) =>
      app.handler(new Request(input, init));

    const client = yield* HttpApiClient.make(MailquiltApi, {
      baseUrl: APP_URL,
    }).pipe(
      Effect.provide(FetchHttpClient.layer),
      Effect.provideService(FetchHttpClient.Fetch, fetchInProcess)
    );

    return Context.make(ApiClient, client).pipe(
      Context.add(AppFetch, fetchInProcess),
      Context.merge(fakes),
      Context.merge(database)
    );
  })
);
