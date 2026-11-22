import { MailquiltApi } from "@repo/contract";
import {
  asMemberOf,
  createProviderConnection,
  deleteProviderConnection,
  listProviderConnections,
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
        createProviderConnection({
          credentials: Option.fromUndefinedOr(payload.credentials),
          from: payload.from,
          name: payload.name,
          smtp: payload.smtp,
        }).pipe(asMemberOf(params.organizationId), signedIn)
      )
      .handle("update", ({ params, payload }) =>
        updateProviderConnection(params.providerConnectionId, {
          credentials:
            payload.credentials === undefined
              ? "keep"
              : Option.fromNullishOr(payload.credentials),
          from: payload.from,
          name: payload.name,
          smtp: payload.smtp,
        }).pipe(asMemberOf(params.organizationId), signedIn)
      )
      .handle("delete", ({ params }) =>
        deleteProviderConnection(params.providerConnectionId).pipe(
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
