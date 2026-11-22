import {
  MailAddress,
  OrganizationIdSchema,
  ProviderConnection,
  ProviderConnectionIdSchema,
  ProviderConnectionName,
  ProviderConnectionNotFound,
  SendFailed,
  Sender,
  SmtpCredentials,
  SmtpServer,
  TestEmailSent,
} from "@repo/domain";
import { Schema } from "effect";
import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from "effect/http-api";

import { OrganizationNotFoundError, SignInRequiredError } from "./errors.ts";

const params = { organizationId: OrganizationIdSchema };

/**
 * An Organization's Provider Connections. Credentials are write-only: `create`
 * accepts them and no endpoint returns them. `sendTestEmail` sends a short
 * email through a connection; when the Provider refuses it, `SendFailed`
 * (502) says why in the Provider's words.
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
        params,
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
        params,
        payload: Schema.Struct({
          name: ProviderConnectionName,
          from: Sender,
          smtp: SmtpServer,
          credentials: Schema.optionalKey(SmtpCredentials),
        }),
        success: ProviderConnection.pipe(HttpApiSchema.status(201)),
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
          ProviderConnectionNotFound.pipe(HttpApiSchema.status(404)),
          SendFailed.pipe(HttpApiSchema.status(502)),
        ],
        params: {
          ...params,
          providerConnectionId: ProviderConnectionIdSchema,
        },
        payload: Schema.Struct({ to: MailAddress }),
        success: TestEmailSent,
      }
    )
  ) {}
