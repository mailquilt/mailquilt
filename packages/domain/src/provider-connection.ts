import { Result, Schema } from "effect";
import { Host } from "effect/net";

import { BROWSER_EMAIL_INPUT_PATTERN } from "./account.ts";
import { ProviderConnectionIdSchema } from "./ids.ts";

const MAX_NAME_LENGTH = 100;

const MAX_SMTP_ADDRESS_LENGTH = 254;

const MAX_HOST_LENGTH = 253;

const MAX_PORT = 65_535;

/** The slowest sending rate a Provider Connection can have, in emails a minute: a batch of 100 then takes 10 minutes, within a Workers consumer's 15. */
export const MIN_EMAILS_PER_MINUTE = 10;

/** The fastest sending rate a Provider Connection can have, in emails a minute: 1,000 a second. */
export const MAX_EMAILS_PER_MINUTE = 60_000;

/**
 * How many emails a minute a Provider Connection sends at most, across
 * every Campaign sending through it.
 */
export const EmailsPerMinute = Schema.Int.check(
  Schema.isBetween(
    { maximum: MAX_EMAILS_PER_MINUTE, minimum: MIN_EMAILS_PER_MINUTE },
    {
      message: `Enter a whole number of emails from ${MIN_EMAILS_PER_MINUTE} to ${MAX_EMAILS_PER_MINUTE.toLocaleString("en")} a minute.`,
    }
  )
);

/** The longest SMTP username or password accepted. */
export const MAX_CREDENTIAL_LENGTH = 1000;

/** What a Provider Connection is called. Spaces around it are trimmed. */
export const ProviderConnectionName = Schema.Trim.check(
  Schema.isNonEmpty({ message: "Enter a name for the connection." }),
  Schema.isMaxLength(MAX_NAME_LENGTH, {
    message: `Use at most ${MAX_NAME_LENGTH} characters.`,
  })
);

/** An email address an email is sent from or to. Spaces around it are trimmed. */
export const MailAddress = Schema.Trim.check(
  Schema.isNonEmpty({ message: "Enter an email address." }),
  Schema.isMaxLength(MAX_SMTP_ADDRESS_LENGTH, {
    message: `Use at most ${MAX_SMTP_ADDRESS_LENGTH} characters.`,
  }),
  Schema.isPattern(BROWSER_EMAIL_INPUT_PATTERN, {
    message: "Enter an email address like name@example.com.",
  })
);

/** The name an email shows as its sender. Spaces around it are trimmed. */
export const SenderName = Schema.Trim.check(
  Schema.isMaxLength(MAX_NAME_LENGTH, {
    message: `Use at most ${MAX_NAME_LENGTH} characters.`,
  })
);

/** Who emails sent through a Provider Connection are from, unless a Campaign says otherwise. */
export const Sender = Schema.Struct({
  name: Schema.optionalKey(SenderName),
  email: MailAddress,
});

/**
 * An SMTP server's host: a domain name or an IP address. Spaces around it are
 * trimmed.
 */
export const SmtpHost = Schema.Trim.check(
  Schema.isNonEmpty({ message: "Enter the server’s host name." }),
  Schema.isMaxLength(MAX_HOST_LENGTH, {
    message: `Use at most ${MAX_HOST_LENGTH} characters.`,
  }),
  Schema.makeFilter((host) => Result.isSuccess(Host.hostFromString(host)), {
    message: "Enter a host name like smtp.example.com, or an IP address.",
  })
);

/** A TCP port. */
export const SmtpPort = Schema.Int.check(
  Schema.isBetween(
    { maximum: MAX_PORT, minimum: 1 },
    {
      message: `Enter a port from 1 to ${MAX_PORT}.`,
    }
  )
);

/**
 * How the connection to an SMTP server is encrypted: TLS from the start
 * (usually port 465), upgraded with STARTTLS (usually 587), or not at all.
 * With `starttls`, a server that doesn't offer STARTTLS is refused rather than
 * used unencrypted.
 */
export const SmtpSecuritySchema = Schema.Literals(["tls", "starttls", "none"]);

export type SmtpSecurity = typeof SmtpSecuritySchema.Type;

/** Where an SMTP Provider Connection sends from. Holds no credentials. */
export const SmtpServer = Schema.Struct({
  host: SmtpHost,
  port: SmtpPort,
  security: SmtpSecuritySchema,
});

const Credential = (message: string) =>
  Schema.RedactedFromValue(
    Schema.String.check(
      Schema.isNonEmpty({ message }),
      Schema.isMaxLength(MAX_CREDENTIAL_LENGTH, {
        message: `Use at most ${MAX_CREDENTIAL_LENGTH} characters.`,
      })
    )
  );

/**
 * What an SMTP server signs in with. Write-only: the API accepts it and never
 * returns it, and it is held as `Redacted` so it never reaches logs.
 */
export const SmtpCredentials = Schema.Struct({
  username: Credential("Enter the username."),
  password: Credential("Enter the password."),
});

/**
 * One Organization's configured SMTP server, as the API shows it: without
 * its credentials, only whether it has saved ones (`signsIn`).
 * `emailsPerMinute` is its sending rate, `null` when it has none.
 */
export class ProviderConnection extends Schema.Class<ProviderConnection>(
  "ProviderConnection"
)({
  id: ProviderConnectionIdSchema,
  name: ProviderConnectionName,
  provider: Schema.Literal("smtp"),
  from: Sender,
  smtp: SmtpServer,
  signsIn: Schema.Boolean,
  emailsPerMinute: Schema.NullOr(EmailsPerMinute),
  createdAt: Schema.DateTimeUtc,
}) {}
