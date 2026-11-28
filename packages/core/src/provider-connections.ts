import type {
  CredentialsRequired,
  ProviderConnection,
  ProviderConnectionId,
  ProviderConnectionNotFound,
  Sender,
  SesAccount,
  SesCredentials,
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
import type { DateTime, Option } from "effect";

import type { CurrentOrganization } from "./current-organization.ts";
import { CurrentUser } from "./current-user.ts";
import { sendThrough } from "./provider.ts";
import type { ProviderConnectionWithCredentials } from "./provider.ts";
import { RateLimiter } from "./rate-limiter.ts";

/** Where a new SMTP Provider Connection sends, and what it signs in with, if anything. */
interface NewSmtpTarget {
  readonly provider: "smtp";
  readonly smtp: typeof SmtpServer.Type;
  readonly credentials: Option.Option<typeof SmtpCredentials.Type>;
  /** Whether its Campaign emails are sent from a signed bounce address (ADR 0021). */
  readonly usesBounceAddress: boolean;
}

/** Which SES account a new SES Provider Connection sends through, and its access key. */
interface NewSesTarget {
  readonly provider: "ses";
  readonly ses: typeof SesAccount.Type;
  readonly credentials: typeof SesCredentials.Type;
}

/** What a new Provider Connection is made from. */
export type NewProviderConnection = (NewSmtpTarget | NewSesTarget) & {
  readonly name: string;
  readonly from: typeof Sender.Type;
  /** Its sending rate, if it has one. */
  readonly emailsPerMinute: Option.Option<number>;
};

/**
 * New settings for a Provider Connection, which may move it to another
 * Provider. `credentials` is `"keep"` to keep the saved ones, or the new
 * ones; for SMTP, `None` is a server that needs no sign-in.
 * `emailsPerMinute` is `"keep"` to keep the saved sending rate, or the new
 * one, `None` for none. For SMTP, `usesBounceAddress` is `"keep"` to keep
 * the saved setting.
 */
export type ProviderConnectionChanges = (
  | (Omit<NewSmtpTarget, "credentials" | "usesBounceAddress"> & {
      readonly credentials: "keep" | Option.Option<typeof SmtpCredentials.Type>;
      readonly usesBounceAddress: "keep" | boolean;
    })
  | (Omit<NewSesTarget, "credentials"> & {
      readonly credentials: "keep" | typeof SesCredentials.Type;
    })
) & {
  readonly name: string;
  readonly from: typeof Sender.Type;
  readonly emailsPerMinute: "keep" | Option.Option<number>;
};

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
     * its Provider, or where it sends (an SMTP server's host, port or
     * encryption, an SES account's Region), changes fails with
     * `CredentialsRequired`, checked in the same statement as the write, so
     * a concurrent change can't slip between the check and the write.
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
    /**
     * Makes a connection the one a new Campaign starts with, in place of
     * any other.
     */
    readonly makeCampaignDefault: (
      id: ProviderConnectionId
    ) => Effect.Effect<
      ProviderConnection,
      ProviderConnectionNotFound,
      CurrentOrganization
    >;
    readonly withCredentials: (
      id: ProviderConnectionId
    ) => Effect.Effect<
      ProviderConnectionWithCredentials,
      ProviderConnectionNotFound,
      CurrentOrganization
    >;
    /**
     * Takes the connection's next free send slot, no earlier than `now`, and
     * moves it on by `interval`, in one statement, so emails through it are
     * at least `interval` apart however many batches send at once (ADR
     * 0018). Says when the slot starts, or `None` once the connection is
     * deleted.
     */
    readonly takeSendSlot: (
      id: ProviderConnectionId,
      interval: Duration.Duration,
      now: DateTime.Utc
    ) => Effect.Effect<Option.Option<DateTime.Utc>, never, CurrentOrganization>;
  }
>()("@repo/core/ProviderConnections") {}

const TEST_EMAIL_RULE = {
  max: TEST_EMAIL_LIMIT.max,
  window: Duration.minutes(TEST_EMAIL_LIMIT.minutes),
};

/** Connects an SMTP server or an SES account to the Organization this request acts in. */
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
 * sent where they were entered for: keeping them while changing the
 * Provider, an SMTP server's host, port or encryption, or an SES account's
 * Region fails with `CredentialsRequired`, so a member can't point someone
 * else's password at a server they control, or send it unencrypted.
 */
export const updateProviderConnection = (
  id: ProviderConnectionId,
  changes: ProviderConnectionChanges
) =>
  Effect.gen(function* updateOrganizationProviderConnection() {
    const connections = yield* ProviderConnections;

    return yield* connections.update(id, changes);
  });

/** Makes a Provider Connection the one the Organization's new Campaigns start with. */
export const makeCampaignDefault = (id: ProviderConnectionId) =>
  Effect.gen(function* makeOrganizationCampaignDefault() {
    const connections = yield* ProviderConnections;

    return yield* connections.makeCampaignDefault(id);
  });

/** Removes a Provider Connection and its saved credentials. */
export const deleteProviderConnection = (id: ProviderConnectionId) =>
  Effect.gen(function* deleteOrganizationProviderConnection() {
    const connections = yield* ProviderConnections;

    yield* connections.remove(id);
  });

const sendsThrough = (opened: ProviderConnectionWithCredentials) =>
  opened.provider === "ses"
    ? `Amazon SES, ${opened.connection.ses.region}`
    : `${opened.connection.smtp.host}:${opened.connection.smtp.port}`;

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
        `It was sent through your provider connection "${connection.name}" (${sendsThrough(opened)}). If you can read it, the connection works.`,
      ].join("\n"),
      to,
    }).pipe(
      Effect.catchTag("SendDeferred", ({ failed }) => Effect.fail(failed))
    );

    return new TestEmailSent({ messageId: sent.messageId });
  });
