import type {
  ProviderConnection,
  ProviderConnectionId,
  ProviderConnectionNotFound,
  Sender,
  SmtpCredentials,
  SmtpServer,
} from "@repo/domain";
import { TestEmailSent } from "@repo/domain";
import { Context, Effect } from "effect";
import type { Option } from "effect";

import type { CurrentOrganization } from "./current-organization.ts";
import { SmtpProvider } from "./provider.ts";

/** What a new SMTP Provider Connection is made from. */
export interface NewProviderConnection {
  readonly name: string;
  readonly from: typeof Sender.Type;
  readonly smtp: typeof SmtpServer.Type;
  readonly credentials: Option.Option<typeof SmtpCredentials.Type>;
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
    readonly withCredentials: (
      id: ProviderConnectionId
    ) => Effect.Effect<
      ProviderConnectionWithCredentials,
      ProviderConnectionNotFound,
      CurrentOrganization
    >;
  }
>()("@repo/core/ProviderConnections") {}

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
 * Sends a short plain-text email to `to` through a Provider Connection, from
 * its default sender, to show that the connection works.
 */
export const sendTestEmail = (id: ProviderConnectionId, to: string) =>
  Effect.gen(function* sendProviderTestEmail() {
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
