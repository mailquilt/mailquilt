import {
  EmailsPerMinute,
  MailAddress,
  ProviderConnectionSchema,
  ProviderConnectionIdSchema,
  ProviderConnectionName,
  Sender,
  SesAccount,
  SesCredentials,
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

const connectionBasics = {
  name: ProviderConnectionName,
  from: Sender,
  emailsPerMinute: Schema.optionalKey(Schema.NullOr(EmailsPerMinute)),
};

const NewSmtpConnection = Schema.Struct({
  provider: Schema.optionalKey(Schema.Literal("smtp")),
  ...connectionBasics,
  smtp: SmtpServer,
  credentials: Schema.optionalKey(SmtpCredentials),
});

const NewSesConnection = Schema.Struct({
  provider: Schema.Literal("ses"),
  ...connectionBasics,
  ses: SesAccount,
  credentials: SesCredentials,
});

const SmtpConnectionChanges = Schema.Struct({
  provider: Schema.optionalKey(Schema.Literal("smtp")),
  ...connectionBasics,
  smtp: SmtpServer,
  credentials: Schema.optionalKey(Schema.NullOr(SmtpCredentials)),
});

const SesConnectionChanges = Schema.Struct({
  provider: Schema.Literal("ses"),
  ...connectionBasics,
  ses: SesAccount,
  credentials: Schema.optionalKey(SesCredentials),
});

const connectionParams = {
  ...organizationParams,
  providerConnectionId: ProviderConnectionIdSchema,
};

/**
 * An Organization's Provider Connections: SMTP servers (`provider` `smtp`,
 * or left out) and SES accounts (`ses`). Credentials are write-only: `create`
 * accepts them and no endpoint returns them; an SES account always needs its
 * access key. `update` keeps the saved credentials when it leaves them out,
 * and for SMTP removes them when they are `null`; a change of Provider, of an
 * SMTP server's host, port or encryption, or of an SES account's Region
 * needs them entered again (`CredentialsRequired`), so saved credentials only
 * ever go where they were entered for. `emailsPerMinute` is the rate a
 * connection sends at, across every Campaign sending through it: each
 * email's send slot starts one interval after the last one's, and emails
 * leave just after their slots, so a few can leave closer together, most
 * after a stall (ADR 0018); `create`
 * without it, or with `null`, sets none, and `update` without it keeps the
 * one saved. An SES account without one keeps to the account's own sending
 * limit, read before each batch of a Campaign. `sendTestEmail` sends a short email through a
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
        success: Schema.Array(ProviderConnectionSchema),
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
        payload: Schema.Union([NewSmtpConnection, NewSesConnection]),
        success: ProviderConnectionSchema.pipe(HttpApiSchema.status(201)),
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
        payload: Schema.Union([SmtpConnectionChanges, SesConnectionChanges]),
        success: ProviderConnectionSchema,
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
