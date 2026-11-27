import { ApiLive, authConfigLayer } from "@repo/api";
import {
  createDeliveryEventPartitions,
  SystemMailerConfigFromEnv,
  SystemMailerLive,
} from "@repo/core";
import {
  consumeQueueBatch,
  emailLinksLive,
  forwardOutboxTo,
  postgresPortsLive,
  providePerRequest,
  SesProviderLive,
  SmtpProviderLive,
  SmtpProviderUnavailable,
} from "@repo/runtime-cloudflare";
import type { QueueBinding } from "@repo/runtime-cloudflare";
import { ConfigProvider, Effect, Layer, Option, Redacted } from "effect";
import { HttpRouter, HttpServer } from "effect/http";

interface Env {
  readonly HYPERDRIVE: Hyperdrive;
  /** The Cloudflare Queue a Campaign's batches are sent through. */
  readonly QUEUE: QueueBinding;
  /** Where the dashboard is served, such as `https://mail.example.com`. */
  readonly APP_URL: string;
  /** A secret, set with `wrangler secret put AUTH_SECRET` (`.dev.vars` locally). */
  readonly AUTH_SECRET: string;
  /** Keys that seal Provider Connection credentials, a secret like AUTH_SECRET (ADR 0009). Unset, every request fails saying so. */
  readonly ENCRYPTION_KEYS?: string;
  /** `true` stops SMTP connections to private networks and loopback too (ADR 0010). */
  readonly BLOCK_PRIVATE_NETWORKS?: string;
  /**
   * The System Mailer, optional: `SYSTEM_MAILER_SMTP_HOST`, `_PORT`,
   * `_SECURITY`, `SYSTEM_MAILER_FROM_EMAIL` and the optional `_FROM_NAME`,
   * `_SMTP_USERNAME` and `_SMTP_PASSWORD` (a secret). Unset, the instance
   * settings page sets it.
   */
  readonly [systemMailerVariable: `SYSTEM_MAILER_${string}`]:
    | string
    | undefined;
}

const EVERY_DAY_AT_3_UTC = "0 3 * * *";

const configFromEnv = (env: Env) =>
  ConfigProvider.layer(
    ConfigProvider.fromEnv({
      env: Object.fromEntries(
        Object.entries(env).filter(
          (entry): entry is [string, string] => typeof entry[1] === "string"
        )
      ),
    })
  );

const smtpProviderLive = (env: Env) =>
  SmtpProviderLive.pipe(Layer.provide(configFromEnv(env)));

const postgresPorts = (env: Env) =>
  postgresPortsLive(
    env.HYPERDRIVE,
    Redacted.make(env.ENCRYPTION_KEYS ?? ""),
    env.QUEUE
  );

const emailLinks = (env: Env) =>
  emailLinksLive(env.APP_URL, Redacted.make(env.ENCRYPTION_KEYS ?? ""));

// WARNING: trust only `cf-connecting-ip`, which Cloudflare sets itself; a client can forge any other IP header.
const authConfigLive = (env: Env) =>
  authConfigLayer({
    appUrl: env.APP_URL,
    clientIpHeader: Option.some("cf-connecting-ip"),
    secret: Redacted.make(env.AUTH_SECRET),
  });

const makeApp = (env: Env) =>
  HttpRouter.toWebHandler(
    ApiLive.pipe(
      providePerRequest(
        Layer.mergeAll(
          SystemMailerLive.pipe(
            Layer.provideMerge(postgresPorts(env)),
            // WARNING: a Worker's connections close with its response, so an account email would be sent before sign-up answers, and its timing would reveal who has an account.
            Layer.provide(SmtpProviderUnavailable),
            Layer.provide(SystemMailerConfigFromEnv),
            Layer.provide(configFromEnv(env))
          ),
          smtpProviderLive(env),
          SesProviderLive,
          emailLinks(env)
        )
      ),
      HttpRouter.provideRequest(
        Layer.mergeAll(
          authConfigLive(env),
          SystemMailerConfigFromEnv.pipe(Layer.provide(configFromEnv(env)))
        )
      ),
      Layer.provide(HttpServer.layerServices),
      Layer.provide(Layer.effectDiscard(Effect.logInfo("Runtime built")))
    )
  );

const runWithPorts = <A, E>(
  env: Env,
  effect: Effect.Effect<
    A,
    E,
    | Layer.Success<ReturnType<typeof postgresPorts>>
    | Layer.Success<ReturnType<typeof smtpProviderLive>>
    | Layer.Success<typeof SesProviderLive>
    | Layer.Success<ReturnType<typeof emailLinks>>
  >
) =>
  Effect.runPromise(
    effect.pipe(
      Effect.provide(
        Layer.mergeAll(
          postgresPorts(env),
          smtpProviderLive(env),
          SesProviderLive,
          emailLinks(env)
        )
      )
    )
  );

// WARNING: built once per isolate on the first request; Hyperdrive bindings can't be read at module load.
let app: ReturnType<typeof makeApp> | undefined;

export default {
  fetch(request, env) {
    app ??= makeApp(env);

    return app.handler(request);
  },

  async queue(batch, env) {
    await runWithPorts(env, consumeQueueBatch(batch));
  },

  async scheduled(controller, env) {
    await runWithPorts(
      env,
      controller.cron === EVERY_DAY_AT_3_UTC
        ? createDeliveryEventPartitions
        : forwardOutboxTo(env.QUEUE).pipe(Effect.asVoid)
    );
  },
} satisfies ExportedHandler<Env>;
