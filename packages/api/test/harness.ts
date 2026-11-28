import { PgClient } from "@effect/sql-pg";
import { MailquiltApi } from "@repo/contract";
import {
  BounceDomain,
  credentialCipherLayer,
  handleQueueMessage,
  PublicUrl,
  receiveBounce,
  signedTokensLayer,
  SystemMailerConfig,
  SystemMailerLive,
} from "@repo/core";
import type {
  BatchDeferred,
  BounceOutcome,
  BounceReports,
  BatchStillSending,
  Queue,
  QueueMessage,
  Scheduler,
  SesNotifications,
  SesProvider,
  SmtpProvider,
  SystemMailer,
  SystemMailerSmtp,
} from "@repo/core";
import type {
  DnsZone,
  SesOutbox,
  SmtpOutbox,
  SystemMailerOutbox,
} from "@repo/core/testing";
import {
  InProcessQueueLive,
  QueueInbox,
  RecordingSesProviderLive,
  RecordingSmtpProviderLive,
  ScriptedDnsLive,
  SystemMailerOutboxLive,
} from "@repo/core/testing";
import { DatabaseLive, DatabasePortsLive } from "@repo/db";
import { migrateDatabase } from "@repo/db/migrate";
import type { SignUpPolicy } from "@repo/domain";
import { BounceReportsLive } from "@repo/providers/bounces";
import { makeSnsSigner, sesNotificationsFor } from "@repo/providers/testing";
import { PostgreSqlContainer } from "@testcontainers/postgresql";
import { Context, Effect, Layer, Option, pipe, Redacted } from "effect";
import { FetchHttpClient, HttpRouter, HttpServer } from "effect/http";
import { HttpApiClient } from "effect/http-api";
import type { Dns } from "effect/net";
import type { SqlClient } from "effect/sql";

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

/** The domain the test install receives bounces at. */
export const BOUNCE_DOMAIN = "bounces.mailquilt.test";

/** Seals Provider Connection credentials in tests: key 1, 32 bytes of 7s. */
export const TEST_ENCRYPTION_KEYS = Redacted.make(
  "1:BwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwc="
);

type DatabasePorts =
  | Layer.Success<typeof DatabasePortsLive>
  | PgClient.PgClient
  | SqlClient.SqlClient
  | PublicUrl
  | Layer.Success<ReturnType<typeof signedTokensLayer>>;

type Fakes =
  | BounceDomain
  | BounceReports
  | SystemMailer
  | SystemMailerOutbox
  | SmtpProvider
  | SmtpOutbox
  | SesProvider
  | SesOutbox
  | SesNotifications
  | Queue
  | QueueInbox
  | Scheduler
  | Dns.Dns
  | DnsZone;

const startPostgres = Effect.acquireRelease(
  Effect.promise(() => new PostgreSqlContainer(POSTGRES_IMAGE).start()),
  (container) => Effect.promise(() => container.stop())
);

interface TestAppOptions {
  /**
   * Whether first-run setup has made the instance admin, and who may then
   * sign up. `"fresh"` is an install nobody has set up yet. By default the
   * install is set up and sign-up is open, so tests can make accounts.
   */
  readonly install?: "fresh" | SignUpPolicy;
  /**
   * `"outbox"` keeps account emails in the System Mailer outbox. `"smtp"`
   * sends them with the real System Mailer, in its place, through the
   * recording SMTP Provider, from `systemMailerConfig` or else the instance
   * settings.
   */
  readonly systemMailer?: "outbox" | "smtp";
  /** The System Mailer set by environment variables, if any. */
  readonly systemMailerConfig?: Option.Option<SystemMailerSmtp>;
}

/** The instance admin first-run setup makes in tests. */
export const INSTANCE_ADMIN = {
  email: "admin@example.com",
  name: "Grace",
  password: "an instance admin's password",
} as const;

const appWith = (
  databasePorts: Context.Context<DatabasePorts>,
  fakes: Context.Context<Fakes>,
  options: TestAppOptions
) => {
  const ports = Layer.mergeAll(
    Layer.succeedContext(databasePorts),
    Layer.succeed(
      SystemMailerConfig,
      options.systemMailerConfig ?? Option.none()
    ),
    Layer.succeedContext(fakes)
  );

  return ApiLive.pipe(
    HttpRouter.provideRequest(
      Layer.mergeAll(
        options.systemMailer === "smtp"
          ? SystemMailerLive.pipe(Layer.provideMerge(ports))
          : ports,
        TestAuthConfig
      )
    ),
    Layer.provide(HttpServer.layerServices)
  );
};

/**
 * Does the work the app queued, as the runtime's queue consumer would, with
 * the same ports the app's requests use.
 */
export const QueueWorker = Context.Service<{
  /**
   * Handles one message, as its `attempt`-th delivery (the first by
   * default). It fails as the runtime's handler would, asking the queue to
   * deliver it again.
   */
  readonly deliver: (
    message: QueueMessage,
    attempt?: number
  ) => Effect.Effect<void, BatchDeferred | BatchStillSending>;
  /** Handles every queued message that's due by the `Clock`, and any they queue, until none are left. Returns what it handled. */
  readonly deliverAll: Effect.Effect<
    readonly QueueMessage[],
    BatchDeferred | BatchStillSending
  >;
}>("test/QueueWorker");

const queueWorker = (ports: Context.Context<DatabasePorts | Fakes>) => {
  const deliver = (message: QueueMessage, attempt = 1) =>
    handleQueueMessage(message, attempt).pipe(Effect.provideContext(ports));

  const inbox = Context.get(ports, QueueInbox);

  const deliverAll = Effect.gen(function* deliverAll() {
    const handled: QueueMessage[] = [];
    let messages = yield* inbox.takeAll;

    while (messages.length > 0) {
      yield* pipe(
        messages,
        Effect.forEach((message) => deliver(message))
      );
      handled.push(...messages);
      messages = yield* inbox.takeAll;
    }

    return handled;
  });

  return { deliver, deliverAll };
};

/**
 * Takes emails sent to the bounce domain, as the Worker's Email Workers
 * handler does, with the same ports the app's requests use.
 */
export const BounceInbox = Context.Service<{
  /** Handles one email sent to `to`, with `raw` as its whole message. */
  readonly receive: (to: string, raw: string) => Effect.Effect<BounceOutcome>;
}>("test/BounceInbox");

/** The signed-in instance admin's session cookie; empty on a fresh install, which has no instance admin. */
export const InstanceAdminCookie = Context.Service<string>(
  "test/InstanceAdminCookie"
);

const setUpInstance = (
  fetch: typeof globalThis.fetch,
  client: HttpApiClient.ForApi<typeof MailquiltApi>,
  signUp: SignUpPolicy
) =>
  Effect.gen(function* setUpTestInstance() {
    yield* client.instance.setUp({
      payload: {
        ...INSTANCE_ADMIN,
        password: Redacted.make(INSTANCE_ADMIN.password),
      },
    });

    const signedIn = yield* Effect.promise(() =>
      fetch(`${APP_URL}/api/auth/sign-in/email`, {
        body: JSON.stringify({
          email: INSTANCE_ADMIN.email,
          password: INSTANCE_ADMIN.password,
        }),
        headers: {
          "content-type": "application/json",
          origin: APP_URL,
          [TRUSTED_IP_HEADER]: "192.0.2.1",
        },
        method: "POST",
      })
    );

    if (!signedIn.ok) {
      return yield* Effect.die(
        new Error("The test install's instance admin couldn't sign in")
      );
    }

    const cookie = signedIn.headers
      .getSetCookie()
      .map((value) => value.split(";")[0])
      .join("; ");

    if (signUp === "open") {
      const opened = yield* Effect.promise(() =>
        fetch(`${APP_URL}/api/instance/settings/sign-up`, {
          body: JSON.stringify({ signUp }),
          headers: {
            "content-type": "application/json",
            cookie,
            origin: APP_URL,
          },
          method: "PUT",
        })
      );

      if (!opened.ok) {
        return yield* Effect.die(
          new Error("Couldn't open sign-up in the test install")
        );
      }
    }

    return cookie;
  });

/** The typed client generated from `contract`, wired to the app in process. */
export class ApiClient extends Context.Service<
  ApiClient,
  HttpApiClient.ForApi<typeof MailquiltApi>
>()("test/ApiClient") {}

/** Signs SNS messages as SNS would, with the certificate the app's SES notifications adapter fetches. */
export const SnsSigner =
  Context.Service<ReturnType<typeof makeSnsSigner>>("test/SnsSigner");

/** Plain `fetch` to the app in process, for routes outside `contract`. */
export const AppFetch =
  Context.Service<typeof globalThis.fetch>("test/AppFetch");

/**
 * The whole API assembled as the entry apps assemble it, with a migrated,
 * real Postgres from Testcontainers, the System Mailer outbox (or the real
 * System Mailer), the recording SMTP and SES Providers, DNS answered from a
 * zone tests script through `DnsZone`, and the SES
 * notifications adapter reaching a fake SNS whose messages `SnsSigner`
 * signs. Unless `install` is
 * `"fresh"`, first-run setup has made `INSTANCE_ADMIN`, whose session cookie
 * is `InstanceAdminCookie`. Its `SqlClient` reaches that Postgres directly,
 * to set up states no endpoint can make yet; tests still check results
 * through the API. Requests go through the same web handler the Worker
 * uses, so routing, encoding and decoding are the real ones.
 */
export const makeTestApp = (options: TestAppOptions = {}) =>
  Layer.effectContext(
    Effect.gen(function* testApp() {
      const postgres = yield* startPostgres;
      const databaseUrl = postgres.getConnectionUri();

      yield* migrateDatabase.pipe(
        Effect.provide(DatabaseLive),
        Effect.provide(PgClient.layer({ url: Redacted.make(databaseUrl) }))
      );

      const snsSigner = makeSnsSigner();

      const fakes = yield* Layer.build(
        Layer.mergeAll(
          SystemMailerOutboxLive,
          RecordingSmtpProviderLive,
          RecordingSesProviderLive,
          sesNotificationsFor(snsSigner),
          InProcessQueueLive,
          ScriptedDnsLive,
          BounceReportsLive,
          Layer.succeed(BounceDomain, {
            domain: Option.some(BOUNCE_DOMAIN),
          })
        )
      );

      const databasePorts = yield* Layer.build(
        DatabasePortsLive.pipe(
          Layer.provideMerge(
            PgClient.layer({ url: Redacted.make(databaseUrl) })
          ),
          Layer.provide(credentialCipherLayer(TEST_ENCRYPTION_KEYS)),
          Layer.provideMerge(signedTokensLayer(TEST_ENCRYPTION_KEYS)),
          Layer.provideMerge(Layer.succeed(PublicUrl, { origin: APP_URL }))
        )
      );

      const database = yield* Layer.build(
        PgClient.layer({ url: Redacted.make(databaseUrl) })
      );

      const app = yield* Effect.acquireRelease(
        Effect.sync(() =>
          HttpRouter.toWebHandler(appWith(databasePorts, fakes, options), {
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

      const context = Context.make(ApiClient, client).pipe(
        Context.add(AppFetch, fetchInProcess),
        Context.add(SnsSigner, snsSigner),
        Context.add(BounceInbox, {
          receive: (to, raw) =>
            receiveBounce(to, new TextEncoder().encode(raw)).pipe(
              Effect.provideContext(Context.merge(databasePorts, fakes))
            ),
        }),
        Context.add(
          QueueWorker,
          queueWorker(Context.merge(databasePorts, fakes))
        ),
        Context.merge(fakes),
        Context.merge(database)
      );

      const install = options.install ?? "open";

      return Context.add(
        context,
        InstanceAdminCookie,
        install === "fresh"
          ? ""
          : yield* setUpInstance(fetchInProcess, client, install)
      );
    })
  );

/** A set-up install with open sign-up, account emails kept in the System Mailer outbox. */
export const TestApp = makeTestApp();
