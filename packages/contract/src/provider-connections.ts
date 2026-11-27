import {
  EmailsPerMinute,
  MailAddress,
  ProviderConnection,
  ProviderConnectionIdSchema,
  ProviderConnectionName,
  Sender,
  SmtpCredentials,
  SmtpServer,
  TestEmailSent,
} from "@repo/domain";
import { Schema } from "effect";
import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from "effect/http-api";

import {
  CredentialsRequiredError,
  OrganizationNotFoundError,
  ProviderConnectionNotFoundError,
  RateLimitedError,
  SendFailedError,
  SignInRequiredError,
} from "./errors.ts";
import { organizationParams } from "./params.ts";

const connectionParams = {
  ...organizationParams,
  providerConnectionId: ProviderConnectionIdSchema,
};

/**
 * An Organization's Provider Connections. Credentials are write-only: `create`
 * accepts them and no endpoint returns them. `update` keeps the saved
 * credentials when it leaves them out, and removes them when they are
 * `null`; a change of host, port or encryption needs them entered again
 * (`CredentialsRequired`), so saved credentials only ever go to the server
 * they were entered for. `emailsPerMinute` is the most emails a minute a
 * connection sends, across every Campaign sending through it; `create`
 * without it, or with `null`, sets none, and `update` without it keeps the
 * one saved. `sendTestEmail` sends a short email through a
 * connection, at most 10 every 10 minutes per person; when the Provider
 * refuses it, `SendFailed` (502) says why in the Provider's words.
 */
export class ProviderConnectionsApi extends HttpApiGroup.make(
  "providerConnections"
)
  .add(
    HttpApiEndpoint.get(
      "list",
      "/organizations/:organizationId/provider-connections",
      {
        error: [SignInRequiredError, OrganizationNotFoundError],
        params: organizationParams,
        success: Schema.Array(ProviderConnection),
      }
    )
  )
  .add(
    HttpApiEndpoint.post(
      "create",
      "/organizations/:organizationId/provider-connections",
      {
        error: [SignInRequiredError, OrganizationNotFoundError],
        params: organizationParams,
        payload: Schema.Struct({
          name: ProviderConnectionName,
          from: Sender,
          smtp: SmtpServer,
          credentials: Schema.optionalKey(SmtpCredentials),
          emailsPerMinute: Schema.optionalKey(Schema.NullOr(EmailsPerMinute)),
        }),
        success: ProviderConnection.pipe(HttpApiSchema.status(201)),
      }
    )
  )
  .add(
    HttpApiEndpoint.put(
      "update",
      "/organizations/:organizationId/provider-connections/:providerConnectionId",
      {
        error: [
          SignInRequiredError,
          OrganizationNotFoundError,
          ProviderConnectionNotFoundError,
          CredentialsRequiredError,
        ],
        params: connectionParams,
        payload: Schema.Struct({
          name: ProviderConnectionName,
          from: Sender,
          smtp: SmtpServer,
          credentials: Schema.optionalKey(Schema.NullOr(SmtpCredentials)),
          emailsPerMinute: Schema.optionalKey(Schema.NullOr(EmailsPerMinute)),
        }),
        success: ProviderConnection,
      }
    )
  )
  .add(
    HttpApiEndpoint.delete(
      "delete",
      "/organizations/:organizationId/provider-connections/:providerConnectionId",
      {
        error: [
          SignInRequiredError,
          OrganizationNotFoundError,
          ProviderConnectionNotFoundError,
        ],
        params: connectionParams,
        success: HttpApiSchema.NoContent,
      }
    )
  )
  .add(
    HttpApiEndpoint.post(
      "sendTestEmail",
      "/organizations/:organizationId/provider-connections/:providerConnectionId/test-emails",
      {
        error: [
          SignInRequiredError,
          OrganizationNotFoundError,
          ProviderConnectionNotFoundError,
          SendFailedError,
          RateLimitedError,
        ],
        params: connectionParams,
        payload: Schema.Struct({ to: MailAddress }),
        success: TestEmailSent,
      }
    )
  ) {}
