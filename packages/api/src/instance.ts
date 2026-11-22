import { MailquiltApi } from "@repo/contract";
import {
  asInstanceAdmin,
  getInstanceSettings,
  instanceStatus,
  setUpInstance,
  updateSignUp,
  updateSystemMailer,
} from "@repo/core";
import { SetupClosed } from "@repo/domain";
import { hashPassword } from "better-auth/crypto";
import { Effect, Option, Redacted } from "effect";
import { HttpApiBuilder } from "effect/http-api";

import { signedIn } from "./auth/signed-in.ts";

/**
 * The install: its public status, first-run setup, and the settings only
 * the instance admin can see or change. Setup checks it is still open
 * before hashing the password, so a closed one costs no work to ask.
 */
export const InstanceHandlers = HttpApiBuilder.group(
  MailquiltApi,
  "instance",
  (handlers) =>
    handlers
      .handle("status", () => instanceStatus)
      .handle("setUp", ({ payload }) =>
        Effect.gen(function* setUp() {
          if ((yield* instanceStatus).setUp) {
            return yield* new SetupClosed();
          }

          const passwordHash = yield* Effect.promise(() =>
            hashPassword(Redacted.value(payload.password))
          );

          yield* setUpInstance({
            email: payload.email.toLowerCase(),
            name: payload.name,
            passwordHash,
          });
        })
      )
      .handle("settings", () =>
        getInstanceSettings.pipe(asInstanceAdmin, signedIn)
      )
      .handle("updateSignUp", ({ payload }) =>
        updateSignUp(payload.signUp).pipe(asInstanceAdmin, signedIn)
      )
      .handle("updateSystemMailer", ({ payload }) =>
        updateSystemMailer({
          credentials:
            payload.credentials === undefined
              ? "keep"
              : Option.fromNullishOr(payload.credentials),
          from: payload.from,
          smtp: payload.smtp,
        }).pipe(asInstanceAdmin, signedIn)
      )
);
