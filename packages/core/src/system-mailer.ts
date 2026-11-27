import { VERIFICATION_EMAIL_SUBJECT } from "@repo/domain";
import { Cause, Context, Effect, Layer, Option } from "effect";

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
 * when the saved one can't be read, or when the server refuses, the email
 * isn't sent and a warning is logged; sending never fails. The log has the
 * subject, never the address or the server's reply, which often quotes the
 * address.
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
          const mailer = yield* (
            Option.isSome(fromEnvironment)
              ? Effect.succeed(fromEnvironment)
              : instance.systemMailerWithCredentials
          ).pipe(
            Effect.catchCause((cause) =>
              Effect.logWarning(
                "System Mailer settings couldn't be read; an account email was not sent",
                { cause: Cause.pretty(cause), subject: email.subject }
              ).pipe(Effect.as(undefined))
            )
          );

          if (mailer === undefined) {
            return;
          }

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
                  {
                    reason:
                      error._tag === "SendDeferred"
                        ? error.failed.reason
                        : error.reason,
                    subject: email.subject,
                  }
                )
              )
            );
        }),
    };
  })
);

/**
 * Makes a System Mailer's `send` answer at once and send afterwards.
 * Otherwise sign-up answers more slowly for a new address, which is sent a
 * link, than for one that already has an account, which isn't, and the
 * delay reveals who has an account. Only for a runtime whose process
 * outlives the request, such as Node; a Worker's connections close with its
 * response.
 */
export const SystemMailerAfterResponding = Layer.effect(
  SystemMailer,
  Effect.gen(function* systemMailerAfterResponding() {
    const mailer = yield* SystemMailer;

    return {
      send: (email) =>
        mailer.send(email).pipe(Effect.forkDetach, Effect.asVoid),
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
