import type {
  CredentialsRequired,
  ProviderConnection,
  ProviderConnectionId,
  ProviderConnectionNotFound,
  Sender,
  SmtpCredentials,
  SmtpServer,
} from "@repo/domain";
import {
  RateLimited,
  TEST_EMAIL_LIMIT,
  TEST_EMAIL_SUBJECT,
  TestEmailSent,
} from "@repo/domain";
import { Context, Duration, Effect } from "effect";
import type { Option } from "effect";

import type { CurrentOrganization } from "./current-organization.ts";
import { CurrentUser } from "./current-user.ts";
import { sendThrough } from "./provider.ts";
import type { ProviderConnectionWithCredentials } from "./provider.ts";
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
    /**
     * Changes a connection. Keeping its saved credentials (`"keep"`) while
     * the host, port or encryption changes fails with `CredentialsRequired`,
     * checked in the same statement as the write, so a concurrent change
     * can't slip between the check and the write.
     */
    readonly update: (
      id: ProviderConnectionId,
      changes: ProviderConnectionChanges
    ) => Effect.Effect<
      ProviderConnection,
      ProviderConnectionNotFound | CredentialsRequired,
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

const TEST_EMAIL_RULE = {
  max: TEST_EMAIL_LIMIT.max,
  window: Duration.minutes(TEST_EMAIL_LIMIT.minutes),
};

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
      TEST_EMAIL_RULE
    );

    if (!decision.allowed) {
      return yield* new RateLimited({
        retryAfterSeconds: Math.ceil(Duration.toSeconds(decision.retryAfter)),
      });
    }

    const connections = yield* ProviderConnections;
    const opened = yield* connections.withCredentials(id);
    const { connection } = opened;

    const sent = yield* sendThrough(opened, {
      from: connection.from,
      subject: TEST_EMAIL_SUBJECT,
      text: [
        "This is a test email from Mailquilt.",
        "",
        `It was sent through your provider connection "${connection.name}" (${connection.smtp.host}:${connection.smtp.port}). If you can read it, the connection works.`,
      ].join("\n"),
      to,
    });

    return new TestEmailSent({ messageId: sent.messageId });
  });
