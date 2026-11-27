import { MailquiltApi } from "@repo/contract";
import {
  asMemberOf,
  createProviderConnection,
  deleteProviderConnection,
  listProviderConnections,
  makeCampaignDefault,
  sendTestEmail,
  updateProviderConnection,
} from "@repo/core";
import { Option } from "effect";
import { HttpApiBuilder } from "effect/http-api";

import { signedIn } from "./auth/signed-in.ts";

/** An Organization's Provider Connections, for its members (ADR 0007). */
export const ProviderConnectionsHandlers = HttpApiBuilder.group(
  MailquiltApi,
  "providerConnections",
  (handlers) =>
    handlers
      .handle("list", ({ params }) =>
        listProviderConnections.pipe(
          asMemberOf(params.organizationId),
          signedIn
        )
      )
      .handle("create", ({ params, payload }) =>
        createProviderConnection(
          payload.provider === "ses"
            ? {
                credentials: payload.credentials,
                emailsPerMinute: Option.fromNullishOr(payload.emailsPerMinute),
                from: payload.from,
                name: payload.name,
                provider: "ses",
                ses: payload.ses,
              }
            : {
                credentials: Option.fromUndefinedOr(payload.credentials),
                emailsPerMinute: Option.fromNullishOr(payload.emailsPerMinute),
                from: payload.from,
                name: payload.name,
                provider: "smtp",
                smtp: payload.smtp,
              }
        ).pipe(asMemberOf(params.organizationId), signedIn)
      )
      .handle("update", ({ params, payload }) => {
        const basics = {
          emailsPerMinute:
            payload.emailsPerMinute === undefined
              ? ("keep" as const)
              : Option.fromNullishOr(payload.emailsPerMinute),
          from: payload.from,
          name: payload.name,
        };

        if (payload.provider === "ses") {
          return updateProviderConnection(params.providerConnectionId, {
            ...basics,
            credentials: payload.credentials ?? "keep",
            provider: "ses",
            ses: payload.ses,
          }).pipe(asMemberOf(params.organizationId), signedIn);
        }

        const credentials =
          payload.credentials === undefined
            ? ("keep" as const)
            : Option.fromNullishOr(payload.credentials);

        return updateProviderConnection(params.providerConnectionId, {
          ...basics,
          credentials,
          provider: "smtp",
          smtp: payload.smtp,
        }).pipe(asMemberOf(params.organizationId), signedIn);
      })
      .handle("delete", ({ params }) =>
        deleteProviderConnection(params.providerConnectionId).pipe(
          asMemberOf(params.organizationId),
          signedIn
        )
      )
      .handle("makeCampaignDefault", ({ params }) =>
        makeCampaignDefault(params.providerConnectionId).pipe(
          asMemberOf(params.organizationId),
          signedIn
        )
      )
      .handle("sendTestEmail", ({ params, payload }) =>
        sendTestEmail(params.providerConnectionId, payload.to).pipe(
          asMemberOf(params.organizationId),
          signedIn
        )
      )
);
