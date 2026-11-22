import {
  MailAddress,
  MAX_CREDENTIAL_LENGTH,
  SenderName,
  SmtpCredentials,
  SmtpHost,
  SmtpPort,
  SmtpSecuritySchema,
} from "@repo/domain";
import type { Sender, SmtpServer } from "@repo/domain";
import {
  Config,
  Context,
  Effect,
  Layer,
  Option,
  Redacted,
  Schema,
} from "effect";

/** Where the System Mailer sends, who from, and what it signs in with. */
export interface SystemMailerSmtp {
  readonly from: typeof Sender.Type;
  readonly smtp: typeof SmtpServer.Type;
  readonly credentials: Option.Option<typeof SmtpCredentials.Type>;
}

/**
 * The System Mailer set by environment variables, if any. When it is set,
 * it is the one used, and the saved one can't be changed.
 */
export class SystemMailerConfig extends Context.Service<
  SystemMailerConfig,
  Option.Option<SystemMailerSmtp>
>()("@repo/core/SystemMailerConfig") {}

const VARIABLES = {
  fromEmail: "SYSTEM_MAILER_FROM_EMAIL",
  fromName: "SYSTEM_MAILER_FROM_NAME",
  host: "SYSTEM_MAILER_SMTP_HOST",
  password: "SYSTEM_MAILER_SMTP_PASSWORD",
  port: "SYSTEM_MAILER_SMTP_PORT",
  security: "SYSTEM_MAILER_SMTP_SECURITY",
  username: "SYSTEM_MAILER_SMTP_USERNAME",
} as const;

const decodeCredentials = Schema.decodeUnknownOption(SmtpCredentials);

const misconfigured = (problem: string) =>
  Effect.die(
    new Error(
      `${problem}. To send account emails through an SMTP server, set ${VARIABLES.host}, ${VARIABLES.port}, ${VARIABLES.security} (tls, starttls or none) and ${VARIABLES.fromEmail}, and optionally ${VARIABLES.fromName}, ${VARIABLES.username} and ${VARIABLES.password}. Leave them all unset to set the System Mailer on the instance settings page.`
    )
  );

/**
 * Reads the System Mailer from `SYSTEM_MAILER_*` environment variables,
 * checked with the same rules as the settings page. With none set, there is
 * none. Some set but not the ones it needs, or a value that fails its check,
 * stops the app rather than leaving account emails unsent.
 */
export const SystemMailerConfigFromEnv = Layer.effect(
  SystemMailerConfig,
  Effect.gen(function* systemMailerConfigFromEnv() {
    const values = yield* Config.all({
      fromEmail: Config.option(Config.schema(MailAddress, VARIABLES.fromEmail)),
      fromName: Config.option(Config.schema(SenderName, VARIABLES.fromName)),
      host: Config.option(Config.schema(SmtpHost, VARIABLES.host)),
      password: Config.option(Config.Redacted(VARIABLES.password)),
      port: Config.option(Config.schema(SmtpPort, VARIABLES.port)),
      security: Config.option(
        Config.schema(SmtpSecuritySchema, VARIABLES.security)
      ),
      username: Config.option(Config.Redacted(VARIABLES.username)),
    }).pipe(Effect.orDie);

    if (
      !Object.values(values).some((value: Option.Option<unknown>) =>
        Option.isSome(value)
      )
    ) {
      return Option.none();
    }

    const { fromEmail, fromName, host, password, port, security, username } =
      values;

    if (
      Option.isNone(host) ||
      Option.isNone(port) ||
      Option.isNone(security) ||
      Option.isNone(fromEmail)
    ) {
      return yield* misconfigured("Some SYSTEM_MAILER_ variables are missing");
    }

    if (Option.isSome(username) !== Option.isSome(password)) {
      return yield* misconfigured(
        `Set both ${VARIABLES.username} and ${VARIABLES.password}, or neither`
      );
    }

    // WARNING: a Schema error quotes the value it failed on, so the credentials are checked here, where the error is replaced.
    const credentials = Option.all({ password, username }).pipe(
      Option.map((secrets) =>
        decodeCredentials({
          password: Redacted.value(secrets.password),
          username: Redacted.value(secrets.username),
        })
      )
    );

    if (Option.isSome(credentials) && Option.isNone(credentials.value)) {
      return yield* misconfigured(
        `${VARIABLES.username} and ${VARIABLES.password} must each be 1 to ${MAX_CREDENTIAL_LENGTH} characters`
      );
    }

    return Option.some({
      credentials: Option.flatten(credentials),
      from: Option.match(fromName, {
        onNone: () => ({ email: fromEmail.value }),
        onSome: (name) => ({ email: fromEmail.value, name }),
      }),
      smtp: { host: host.value, port: port.value, security: security.value },
    });
  })
);
