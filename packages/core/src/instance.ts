import type {
  CredentialsRequired,
  Sender,
  SignUpPolicy,
  SmtpCredentials,
  SmtpServer,
  UserId,
  SetupClosed,
} from "@repo/domain";
import {
  InstanceAdminRequired,
  InstanceSettings,
  InstanceStatus,
  SystemMailerFromEnvironment,
  SystemMailerSettings,
} from "@repo/domain";
import { Context, Effect, Option } from "effect";

import { BounceDomain } from "./bounce-domain.ts";
import { CurrentUser } from "./current-user.ts";
import { InstanceAdmin } from "./instance-admin.ts";
import { SystemMailerConfig } from "./system-mailer-config.ts";
import type { SystemMailerSmtp } from "./system-mailer-config.ts";

/** The install's first account, made by first-run setup. */
export interface NewInstanceAdmin {
  readonly name: string;
  /** Lowercased, as Better Auth stores and looks up addresses. */
  readonly email: string;
  /** The password, already hashed the way Better Auth checks it at sign-in. */
  readonly passwordHash: string;
}

/** A saved System Mailer, as the instance admin sees it: no credentials. */
export interface SavedSystemMailer {
  readonly from: typeof Sender.Type;
  readonly smtp: typeof SmtpServer.Type;
  readonly signsIn: boolean;
}

/**
 * New System Mailer settings. `credentials` is `"keep"` to keep the saved
 * ones, or the new ones, `None` for a server that needs no sign-in.
 */
export interface SystemMailerChanges {
  readonly from: typeof Sender.Type;
  readonly smtp: typeof SmtpServer.Type;
  readonly credentials: "keep" | Option.Option<typeof SmtpCredentials.Type>;
}

/** Port: the install itself, its instance admin and its settings. */
export class Instance extends Context.Service<
  Instance,
  {
    /** Whether first-run setup has made the instance admin, and who may sign up. */
    readonly status: Effect.Effect<{
      readonly setUp: boolean;
      readonly signUp: SignUpPolicy;
    }>;
    /**
     * Makes the instance admin and closes setup for good, in one
     * transaction, so of two setups at once only one succeeds. Fails with
     * `SetupClosed` once setup has run.
     */
    readonly setUp: (
      admin: NewInstanceAdmin
    ) => Effect.Effect<void, SetupClosed>;
    readonly isAdmin: (user: UserId) => Effect.Effect<boolean>;
    readonly setSignUp: (
      policy: SignUpPolicy
    ) => Effect.Effect<void, never, InstanceAdmin>;
    readonly systemMailer: Effect.Effect<
      Option.Option<SavedSystemMailer>,
      never,
      InstanceAdmin
    >;
    /**
     * Saves the System Mailer. Keeping its saved credentials (`"keep"`)
     * while the host, port or encryption changes fails with
     * `CredentialsRequired`, checked in the same statement as the write.
     */
    readonly saveSystemMailer: (
      changes: SystemMailerChanges
    ) => Effect.Effect<void, CredentialsRequired, InstanceAdmin>;
    /** The saved System Mailer with its credentials opened, for sending only. */
    readonly systemMailerWithCredentials: Effect.Effect<
      Option.Option<SystemMailerSmtp>
    >;
  }
>()("@repo/core/Instance") {}

/** Whether setup has run, and who may sign up, for checks that need only that, such as sign-up's. */
export const setUpAndSignUp = Effect.gen(function* setUpAndSignUp() {
  const instance = yield* Instance;

  return yield* instance.status;
});

/**
 * Whether setup has run, who may sign up, and the domain the install
 * receives bounces at, if any. Anyone may ask.
 */
export const instanceStatus = Effect.gen(function* instanceStatus() {
  const instance = yield* Instance;
  const { domain } = yield* BounceDomain;
  const status = yield* instance.status;

  return new InstanceStatus({
    ...status,
    bounceDomain: Option.getOrNull(domain),
  });
});

/** First-run setup: makes the instance admin, once. */
export const setUpInstance = (admin: NewInstanceAdmin) =>
  Effect.gen(function* setUpInstanceAdmin() {
    const instance = yield* Instance;

    yield* instance.setUp(admin);
  });

/**
 * Runs `effect` as the instance admin, if the signed-in person is one.
 * Otherwise it fails with `InstanceAdminRequired`. This is the only place
 * `InstanceAdmin` comes from.
 */
export const asInstanceAdmin = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  Effect.gen(function* asAdmin() {
    const user = yield* CurrentUser;
    const instance = yield* Instance;

    if (!(yield* instance.isAdmin(user.id))) {
      return yield* new InstanceAdminRequired();
    }

    return yield* effect.pipe(Effect.provideService(InstanceAdmin, user));
  });

/**
 * The install's settings. A System Mailer set by environment variables is
 * shown in place of a saved one, because it is the one used.
 */
export const getInstanceSettings = Effect.gen(function* getInstanceSettings() {
  const instance = yield* Instance;
  const fromEnvironment = yield* SystemMailerConfig;
  const status = yield* instance.status;

  const systemMailer = Option.isSome(fromEnvironment)
    ? Option.some(
        new SystemMailerSettings({
          from: fromEnvironment.value.from,
          signsIn: Option.isSome(fromEnvironment.value.credentials),
          smtp: fromEnvironment.value.smtp,
          source: "environment",
        })
      )
    : (yield* instance.systemMailer).pipe(
        Option.map(
          (saved) => new SystemMailerSettings({ ...saved, source: "settings" })
        )
      );

  return new InstanceSettings({
    signUp: status.signUp,
    systemMailer: Option.getOrNull(systemMailer),
  });
});

/** Sets who may sign up, and answers with the settings. */
export const updateSignUp = (policy: SignUpPolicy) =>
  Effect.gen(function* updateSignUpPolicy() {
    const instance = yield* Instance;

    yield* instance.setSignUp(policy);

    return yield* getInstanceSettings;
  });

/**
 * Saves the System Mailer, and answers with the settings. Refused with
 * `SystemMailerFromEnvironment` while environment variables set it, since a
 * saved one would never be used.
 */
export const updateSystemMailer = (changes: SystemMailerChanges) =>
  Effect.gen(function* updateSavedSystemMailer() {
    if (Option.isSome(yield* SystemMailerConfig)) {
      return yield* new SystemMailerFromEnvironment();
    }

    const instance = yield* Instance;

    yield* instance.saveSystemMailer(changes);

    return yield* getInstanceSettings;
  });
