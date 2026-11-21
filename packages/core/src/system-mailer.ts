import { Context, Effect, Layer } from "effect";

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
 * The System Mailer until an instance configures one: it sends nothing and
 * logs a warning without the address or the content.
 */
export const SystemMailerNotConfigured = Layer.succeed(SystemMailer, {
  send: (email) =>
    Effect.logWarning(
      "System Mailer is not configured; an account email was not sent",
      { subject: email.subject }
    ),
});

/** Sends the link that verifies a new account's email address. */
export const sendEmailVerification = (to: string, url: string) =>
  Effect.gen(function* sendVerificationLink() {
    const mailer = yield* SystemMailer;
    yield* mailer.send({
      subject: "Verify your email address for Mailquilt",
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
