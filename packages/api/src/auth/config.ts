import { Config, Context, Effect, Layer, Option, Redacted } from "effect";

const MIN_SECRET_LENGTH = 32;

interface AuthSettings {
  /** Where the dashboard is served, such as `https://mail.example.com`. The only trusted origin. */
  readonly appUrl: string;
  /** Signs session cookies and verification links. */
  readonly secret: Redacted.Redacted;
  /**
   * The request header that holds the client's IP address, set by the
   * proxy in front of the app. `None` uses the directly connected peer.
   * A header any client can set, such as `X-Forwarded-For`, must never be
   * named here unless a proxy replaces it.
   */
  readonly clientIpHeader: Option.Option<string>;
}

/** How the deployment authenticates people. */
export class AuthConfig extends Context.Service<AuthConfig, AuthSettings>()(
  "@repo/api/AuthConfig"
) {}

/**
 * Checks the settings before anything is served. Without a secret, Better
 * Auth would sign with its public default one, so a short or missing secret
 * stops the app instead.
 */
export const authConfigLayer = (settings: AuthSettings) =>
  Layer.effect(
    AuthConfig,
    Effect.gen(function* checkAuthSettings() {
      const appUrl = URL.parse(settings.appUrl);

      if (appUrl?.protocol !== "https:" && appUrl?.protocol !== "http:") {
        return yield* Effect.die(
          new Error("APP_URL must be an absolute http or https URL")
        );
      }

      if (Redacted.value(settings.secret).length < MIN_SECRET_LENGTH) {
        return yield* Effect.die(
          new Error(
            `AUTH_SECRET must be at least ${MIN_SECRET_LENGTH} characters`
          )
        );
      }

      return {
        appUrl: appUrl.origin,
        clientIpHeader: settings.clientIpHeader.pipe(
          Option.map((header) => header.toLowerCase())
        ),
        secret: settings.secret,
      };
    })
  );

/**
 * Reads `APP_URL`, `AUTH_SECRET` and the optional `CLIENT_IP_HEADER`, for a
 * deployment behind any proxy (Docker). Without `CLIENT_IP_HEADER`, the
 * client is the directly connected peer.
 */
export const AuthConfigFromEnv = Layer.unwrap(
  Effect.gen(function* authConfigFromEnv() {
    return authConfigLayer({
      appUrl: yield* Config.NonEmptyString("APP_URL"),
      clientIpHeader: yield* Config.option(
        Config.NonEmptyString("CLIENT_IP_HEADER")
      ),
      secret: yield* Config.Redacted("AUTH_SECRET"),
    });
  })
);
