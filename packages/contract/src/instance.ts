import {
  EmailAddress,
  InstanceSettings,
  InstanceStatus,
  NewPassword,
  PersonName,
  Sender,
  SignUpPolicySchema,
  SmtpCredentials,
  SmtpServer,
} from "@repo/domain";
import { Schema } from "effect";
import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from "effect/http-api";

import {
  CredentialsRequiredError,
  InstanceAdminRequiredError,
  SetupClosedError,
  SignInRequiredError,
  SystemMailerFromEnvironmentError,
} from "./errors.ts";

/**
 * The install itself. `status` is public, so the dashboard knows whether to
 * show first-run setup and whether sign-up is open. `setUp` makes the
 * instance admin, once: after it succeeds it answers `SetupClosed` (409)
 * forever. The settings endpoints answer only the instance admin. The
 * System Mailer's credentials are write-only, kept when left out and removed
 * when `null`, and only ever sent to the server they were entered for
 * (`CredentialsRequired`). Environment variables win over the saved System
 * Mailer, which then can't be changed (`SystemMailerFromEnvironment`, 409).
 */
export class InstanceApi extends HttpApiGroup.make("instance")
  .add(
    HttpApiEndpoint.get("status", "/instance", {
      success: InstanceStatus,
    })
  )
  .add(
    HttpApiEndpoint.post("setUp", "/instance/setup", {
      error: SetupClosedError,
      payload: Schema.Struct({
        name: PersonName,
        email: EmailAddress,
        password: Schema.RedactedFromValue(NewPassword),
      }),
      success: HttpApiSchema.NoContent,
    })
  )
  .add(
    HttpApiEndpoint.get("settings", "/instance/settings", {
      error: [SignInRequiredError, InstanceAdminRequiredError],
      success: InstanceSettings,
    })
  )
  .add(
    HttpApiEndpoint.put("updateSignUp", "/instance/settings/sign-up", {
      error: [SignInRequiredError, InstanceAdminRequiredError],
      payload: Schema.Struct({ signUp: SignUpPolicySchema }),
      success: InstanceSettings,
    })
  )
  .add(
    HttpApiEndpoint.put(
      "updateSystemMailer",
      "/instance/settings/system-mailer",
      {
        error: [
          SignInRequiredError,
          InstanceAdminRequiredError,
          CredentialsRequiredError,
          SystemMailerFromEnvironmentError,
        ],
        payload: Schema.Struct({
          from: Sender,
          smtp: SmtpServer,
          credentials: Schema.optionalKey(Schema.NullOr(SmtpCredentials)),
        }),
        success: InstanceSettings,
      }
    )
  ) {}
