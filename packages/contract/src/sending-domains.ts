import {
  NewSendingDomain,
  SendingDomain,
  SendingDomainIdSchema,
} from "@repo/domain";
import { Schema } from "effect";
import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from "effect/http-api";

import {
  DnsLookupFailedError,
  OrganizationNotFoundError,
  SendingDomainAlreadyExistsError,
  SendingDomainNotFoundError,
  SignInRequiredError,
} from "./errors.ts";
import { organizationParams } from "./params.ts";

const sendingDomainParams = {
  ...organizationParams,
  sendingDomainId: SendingDomainIdSchema,
};

/**
 * An Organization's Sending Domains. A Campaign is sent only from an
 * address at one of them that passes DKIM and DMARC when it's sent. `check`
 * looks its DNS up now and keeps what it found; a lookup that fails, such as
 * a timeout, keeps nothing and answers `DnsLookupFailed`.
 */
export class SendingDomainsApi extends HttpApiGroup.make("sendingDomains")
  .add(
    HttpApiEndpoint.get(
      "list",
      "/organizations/:organizationId/sending-domains",
      {
        error: [SignInRequiredError, OrganizationNotFoundError],
        params: organizationParams,
        success: Schema.Array(SendingDomain),
      }
    )
  )
  .add(
    HttpApiEndpoint.post(
      "create",
      "/organizations/:organizationId/sending-domains",
      {
        error: [
          SignInRequiredError,
          OrganizationNotFoundError,
          SendingDomainAlreadyExistsError,
        ],
        params: organizationParams,
        payload: NewSendingDomain,
        success: SendingDomain.pipe(HttpApiSchema.status(201)),
      }
    )
  )
  .add(
    HttpApiEndpoint.get(
      "get",
      "/organizations/:organizationId/sending-domains/:sendingDomainId",
      {
        error: [
          SignInRequiredError,
          OrganizationNotFoundError,
          SendingDomainNotFoundError,
        ],
        params: sendingDomainParams,
        success: SendingDomain,
      }
    )
  )
  .add(
    HttpApiEndpoint.post(
      "check",
      "/organizations/:organizationId/sending-domains/:sendingDomainId/check",
      {
        error: [
          SignInRequiredError,
          OrganizationNotFoundError,
          SendingDomainNotFoundError,
          DnsLookupFailedError,
        ],
        params: sendingDomainParams,
        success: SendingDomain,
      }
    )
  )
  .add(
    HttpApiEndpoint.delete(
      "remove",
      "/organizations/:organizationId/sending-domains/:sendingDomainId",
      {
        error: [
          SignInRequiredError,
          OrganizationNotFoundError,
          SendingDomainNotFoundError,
        ],
        params: sendingDomainParams,
        success: HttpApiSchema.NoContent,
      }
    )
  ) {}
