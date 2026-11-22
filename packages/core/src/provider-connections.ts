import type {
  ProviderConnection,
  ProviderConnectionId,
  ProviderConnectionNotFound,
  Sender,
  SmtpCredentials,
  SmtpServer,
} from "@repo/domain";
import { CredentialsRequired, RateLimited, TestEmailSent } from "@repo/domain";
import { Context, Duration, Effect, Option } from "effect";

import type { CurrentOrganization } from "./current-organization.ts";
import { CurrentUser } from "./current-user.ts";
import { SmtpProvider } from "./provider.ts";
import { RateLimiter } from "./rate-limiter.ts";

/** What a new SMTP Provider Connection is made from. */
export interface NewProviderConnection {
  readonly name: string;
  readonly from: typeof Sender.Type;
  readonly smtp: typeof SmtpServer.Type;
  readonly credentials: Option.Option<typeof SmtpCredentials.Type>;
}

/**
 * New settings for a Provider Connection. `credentials` is `"keep"` to keep
 * the saved ones, or the new ones, `None` for a server that needs no
 * sign-in.
 */
export interface ProviderConnectionChanges {
  readonly name: string;
  readonly from: typeof Sender.Type;
  readonly smtp: typeof SmtpServer.Type;
  readonly credentials: "keep" | Option.Option<typeof SmtpCredentials.Type>;
}

/** A Provider Connection with its credentials opened, for sending only. */
export interface ProviderConnectionWithCredentials {
  readonly connection: ProviderConnection;
  readonly credentials: Option.Option<typeof SmtpCredentials.Type>;
}

/**
 * Port: the Provider Connections of the Organization a request acts in.
 * Credentials are stored sealed and never come back in a
 * `ProviderConnection`; only `withCredentials` opens them, to send.
 */
export class ProviderConnections extends Context.Service<
  ProviderConnections,
  {
    readonly create: (
      connection: NewProviderConnection
    ) => Effect.Effect<ProviderConnection, never, CurrentOrganization>;
    /** Every Provider Connection, oldest first. */
    readonly all: Effect.Effect<
      readonly ProviderConnection[],
      never,
      CurrentOrganization
    >;
    readonly update: (
      id: ProviderConnectionId,
      changes: ProviderConnectionChanges
    ) => Effect.Effect<
      ProviderConnection,
      ProviderConnectionNotFound,
      CurrentOrganization
    >;
    readonly remove: (
      id: ProviderConnectionId
    ) => Effect.Effect<void, ProviderConnectionNotFound, CurrentOrganization>;
    readonly withCredentials: (
      id: ProviderConnectionId
    ) => Effect.Effect<
      ProviderConnectionWithCredentials,
      ProviderConnectionNotFound,
      CurrentOrganization
    >;
  }
>()("@repo/core/ProviderConnections") {}

/** How many test emails one person may send. */
export const TEST_EMAIL_LIMIT = { max: 10, window: Duration.minutes(10) };

const sameServer = (a: typeof SmtpServer.Type, b: typeof SmtpServer.Type) =>
  a.host === b.host && a.port === b.port && a.security === b.security;

/** The subject of a test email, so the person can find it in their inbox. */
export const TEST_EMAIL_SUBJECT = "Mailquilt test email";

/** Connects an SMTP server to the Organization this request acts in. */
export const createProviderConnection = (connection: NewProviderConnection) =>
  Effect.gen(function* createOrganizationProviderConnection() {
    const connections = yield* ProviderConnections;

    return yield* connections.create(connection);
  });

/** Every Provider Connection in the Organization, oldest first. */
export const listProviderConnections = Effect.gen(
  function* listOrganizationProviderConnections() {
    const connections = yield* ProviderConnections;

    return yield* connections.all;
  }
);

/**
 * Changes a Provider Connection's settings. Saved credentials are only ever
 * sent to the server they were entered for: keeping them while changing the
 * host, port or encryption fails with `CredentialsRequired`, so a member
 * can't point someone else's password at a server they control, or send it
 * unencrypted.
 */
export const updateProviderConnection = (
  id: ProviderConnectionId,
  changes: ProviderConnectionChanges
) =>
  Effect.gen(function* updateOrganizationProviderConnection() {
    const connections = yield* ProviderConnections;

    if (changes.credentials === "keep") {
      const current = yield* connections.withCredentials(id);

      if (
        Option.isSome(current.credentials) &&
        !sameServer(current.connection.smtp, changes.smtp)
      ) {
        return yield* new CredentialsRequired();
      }
    }

    return yield* connections.update(id, changes);
  });

/** Removes a Provider Connection and its saved credentials. */
export const deleteProviderConnection = (id: ProviderConnectionId) =>
  Effect.gen(function* deleteOrganizationProviderConnection() {
    const connections = yield* ProviderConnections;

    yield* connections.remove(id);
  });

/**
 * Sends a short plain-text email to `to` through a Provider Connection, from
 * its default sender, to show that the connection works. Each person may send
 * `TEST_EMAIL_LIMIT` of them, in any Organization, since each one opens a
 * connection to a server they chose and emails any address.
 */
export const sendTestEmail = (id: ProviderConnectionId, to: string) =>
  Effect.gen(function* sendProviderTestEmail() {
    const user = yield* CurrentUser;
    const limiter = yield* RateLimiter;

    const decision = yield* limiter.consume(
      `test-email:user:${user.id}`,
      TEST_EMAIL_LIMIT
    );

    if (!decision.allowed) {
      return yield* new RateLimited({
        retryAfterSeconds: Math.ceil(Duration.toSeconds(decision.retryAfter)),
      });
    }

    const connections = yield* ProviderConnections;
    const smtp = yield* SmtpProvider;
    const { connection, credentials } = yield* connections.withCredentials(id);

    const sent = yield* smtp.send(
      { credentials, server: connection.smtp },
      {
        from: connection.from,
        subject: TEST_EMAIL_SUBJECT,
        text: [
          "This is a test email from Mailquilt.",
          "",
          `It was sent through your provider connection "${connection.name}" (${connection.smtp.host}:${connection.smtp.port}). If you can read it, the connection works.`,
        ].join("\n"),
        to,
      }
    );

    return new TestEmailSent({ messageId: sent.messageId });
  });
