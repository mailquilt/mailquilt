import { ApiLive, authConfigLayer } from "@repo/api";
import { SystemMailerConfigFromEnv, SystemMailerLive } from "@repo/core";
import {
  postgresPortsLive,
  providePerRequest,
  SmtpProviderUnavailable,
} from "@repo/runtime-cloudflare";
import { ConfigProvider, Effect, Layer, Option, Redacted } from "effect";
import { HttpRouter, HttpServer } from "effect/http";

interface Env {
  readonly HYPERDRIVE: Hyperdrive;
  /** Where the dashboard is served, such as `https://mail.example.com`. */
  readonly APP_URL: string;
  /** A secret, set with `wrangler secret put AUTH_SECRET` (`.dev.vars` locally). */
  readonly AUTH_SECRET: string;
  /** Keys that seal Provider Connection credentials, a secret like AUTH_SECRET (ADR 0009). Unset, every request fails saying so. */
  readonly ENCRYPTION_KEYS?: string;
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

const systemMailerConfig = (env: Env) =>
  SystemMailerConfigFromEnv.pipe(
    Layer.provide(
      ConfigProvider.layer(
        ConfigProvider.fromEnv({
          env: Object.fromEntries(
            Object.entries(env).filter(
              (entry): entry is [string, string] =>
                entry[0].startsWith("SYSTEM_MAILER_") &&
                typeof entry[1] === "string"
            )
          ),
        })
      )
    )
  );

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
      // WARNING: a Worker's connections close with its response, so account emails are sent before it; with SMTP here (#11), keep sign-up's answer from waiting on them.
      providePerRequest(
        SystemMailerLive.pipe(
          Layer.provideMerge(
            postgresPortsLive(
              env.HYPERDRIVE,
              Redacted.make(env.ENCRYPTION_KEYS ?? "")
            )
          ),
          Layer.provide(SmtpProviderUnavailable),
          Layer.provide(systemMailerConfig(env))
        )
      ),
      HttpRouter.provideRequest(
        Layer.mergeAll(
          authConfigLive(env),
          SmtpProviderUnavailable,
          systemMailerConfig(env)
        )
      ),
      Layer.provide(HttpServer.layerServices),
      Layer.provide(Layer.effectDiscard(Effect.logInfo("Runtime built")))
    )
  );

// WARNING: built once per isolate on the first request; Hyperdrive bindings can't be read at module load.
let app: ReturnType<typeof makeApp> | undefined;

export default {
  fetch(request, env) {
    app ??= makeApp(env);

    return app.handler(request);
  },
} satisfies ExportedHandler<Env>;
