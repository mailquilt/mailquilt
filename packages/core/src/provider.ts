import type {
  SesConnection,
  SesCredentials,
  SmtpConnection,
  SmtpCredentials,
} from "@repo/domain";
import { Effect, Option } from "effect";

import type { OutgoingEmail } from "./provider-port.ts";
import { SesProvider } from "./ses-provider.ts";
import { SmtpProvider } from "./smtp-provider.ts";

/**
 * A Provider Connection with its credentials opened, for sending only.
 * `provider` repeats the connection's, so checking it tells which
 * credentials these are.
 */
export type ProviderConnectionWithCredentials =
  | {
      readonly provider: "smtp";
      readonly connection: SmtpConnection;
      readonly credentials: Option.Option<typeof SmtpCredentials.Type>;
    }
  | {
      readonly provider: "ses";
      readonly connection: SesConnection;
      readonly credentials: typeof SesCredentials.Type;
    };

/**
 * Sends one email through a Provider Connection, with the adapter for its
 * Provider. This is the one place that picks an adapter for a connection, so
 * a new Provider, such as Cloudflare Email (#20), adds its case here and the
 * use cases that send don't change (ADR 0015).
 */
export const sendThrough = (
  opened: ProviderConnectionWithCredentials,
  email: OutgoingEmail
) =>
  Effect.gen(function* sendThroughConnection() {
    if (opened.provider === "ses") {
      const ses = yield* SesProvider;

      return yield* ses.send(
        { account: opened.connection.ses, credentials: opened.credentials },
        email
      );
    }

    const smtp = yield* SmtpProvider;

    return yield* smtp.send(
      { credentials: opened.credentials, server: opened.connection.smtp },
      email
    );
  });

const SECONDS_PER_MINUTE = 60;

// WARNING: SES gives every account at least 1 email a second, its sandbox's limit, so when the account's limit can't be read this rate never goes over it.
const LOWEST_SES_RATE_PER_SECOND = 1;

/**
 * The most emails a minute that go through a Provider Connection: its own
 * sending rate when it has one; for SES without one, the account's sending
 * limit, read now, or 1 a second when it can't be read; `None` for SMTP
 * without one.
 */
export const sendingRateOf = (opened: ProviderConnectionWithCredentials) =>
  Effect.gen(function* sendingRateOfConnection() {
    const own = Option.fromNullishOr(opened.connection.emailsPerMinute);

    if (Option.isSome(own) || opened.provider === "smtp") {
      return own;
    }

    const ses = yield* SesProvider;

    const perSecond = yield* ses.maxSendRate({
      account: opened.connection.ses,
      credentials: opened.credentials,
    });

    return Option.some(
      Option.getOrElse(perSecond, () => LOWEST_SES_RATE_PER_SECOND) *
        SECONDS_PER_MINUTE
    );
  });
