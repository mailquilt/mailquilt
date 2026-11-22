import { VERIFICATION_EMAIL_SUBJECT } from "@repo/domain";
import { Context, Effect, Layer, Option } from "effect";

import { Instance } from "./instance.ts";
import { SmtpProvider } from "./provider.ts";
import { SystemMailerConfig } from "./system-mailer-config.ts";

/** One of Mailquilt's own account emails, in plain text. */
export interface SystemEmail {
  readonly to: string;
  readonly subject: string;
  readonly text: string;
}

/**
 * Port: sends Mailquilt's own account emails, such as email verification.
 * Never an Organization's email (ADR 0002).
 */
export class SystemMailer extends Context.Service<
  SystemMailer,
  { readonly send: (email: SystemEmail) => Effect.Effect<void> }
>()("@repo/core/SystemMailer") {}

/**
 * The System Mailer: sends through the SMTP server set by environment
 * variables, or else the one saved in the instance settings. With neither,
 * or when the server refuses, the email isn't sent and a warning is logged
 * with the subject only. The address and the server's reply, which often
 * quotes the address, never reach the log.
 */
export const SystemMailerLive = Layer.effect(
  SystemMailer,
  Effect.gen(function* systemMailer() {
    const fromEnvironment = yield* SystemMailerConfig;
    const instance = yield* Instance;
    const smtp = yield* SmtpProvider;

    return {
      send: (email) =>
        Effect.gen(function* sendSystemEmail() {
          const mailer = Option.isSome(fromEnvironment)
            ? fromEnvironment
            : yield* instance.systemMailerWithCredentials;

          if (Option.isNone(mailer)) {
            return yield* Effect.logWarning(
              "System Mailer is not configured; an account email was not sent",
              { subject: email.subject }
            );
          }

          yield* smtp
            .send(
              {
                credentials: mailer.value.credentials,
                server: mailer.value.smtp,
              },
              { ...email, from: mailer.value.from }
            )
            .pipe(
              Effect.catch((error) =>
                Effect.logWarning(
                  "System Mailer couldn't send an account email",
                  { reason: error.reason, subject: email.subject }
                )
              )
            );
        }),
    };
  })
);

/** Sends the link that verifies a new account's email address. */
export const sendEmailVerification = (to: string, url: string) =>
  Effect.gen(function* sendVerificationLink() {
    const mailer = yield* SystemMailer;
    yield* mailer.send({
      subject: VERIFICATION_EMAIL_SUBJECT,
      text: [
        "Open this link to verify your email address and finish signing up for Mailquilt:",
        "",
        url,
        "",
        "If you didn't sign up, you can ignore this email.",
      ].join("\n"),
      to,
    });
  });
