import { MailquiltApi } from "@repo/contract";
import {
  addSendingDomain,
  asMemberOf,
  checkSendingDomain,
  getSendingDomain,
  listSendingDomains,
  removeSendingDomain,
} from "@repo/core";
import { HttpApiBuilder } from "effect/http-api";

import { signedIn } from "./auth/signed-in.ts";

/** An Organization's Sending Domains, for its members (ADR 0007). */
export const SendingDomainsHandlers = HttpApiBuilder.group(
  MailquiltApi,
  "sendingDomains",
  (handlers) =>
    handlers
      .handle("list", ({ params }) =>
        listSendingDomains.pipe(asMemberOf(params.organizationId), signedIn)
      )
      .handle("create", ({ params, payload }) =>
        addSendingDomain(payload).pipe(
          asMemberOf(params.organizationId),
          signedIn
        )
      )
      .handle("get", ({ params }) =>
        getSendingDomain(params.sendingDomainId).pipe(
          asMemberOf(params.organizationId),
          signedIn
        )
      )
      .handle("check", ({ params }) =>
        checkSendingDomain(params.sendingDomainId).pipe(
          asMemberOf(params.organizationId),
          signedIn
        )
      )
      .handle("remove", ({ params }) =>
        removeSendingDomain(params.sendingDomainId).pipe(
          asMemberOf(params.organizationId),
          signedIn
        )
      )
);
