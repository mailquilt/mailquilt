import { SmtpProvider } from "@repo/core";
import { SendFailed } from "@repo/domain";
import { Effect, Layer } from "effect";

/**
 * SMTP on Workers until its adapter over `connect()` exists: a Provider
 * Connection can be saved, and sending through it says it can't be done here
 * yet.
 */
export const SmtpProviderUnavailable = Layer.succeed(SmtpProvider, {
  parseNotifications: () => Effect.succeed([]),
  send: () =>
    Effect.fail(
      new SendFailed({
        detail:
          "Sending through SMTP doesn't work on Cloudflare yet. It works on the Docker image.",
        reason: "unavailable",
      })
    ),
});
