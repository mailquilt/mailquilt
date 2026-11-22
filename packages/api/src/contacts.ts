import { MailquiltApi } from "@repo/contract";
import { asMemberOf, createContact, listContacts } from "@repo/core";
import { Option } from "effect";
import { HttpApiBuilder } from "effect/http-api";

import { signedIn } from "./auth/signed-in.ts";

/** An Organization's Contacts, for its members (ADR 0007). */
export const ContactsHandlers = HttpApiBuilder.group(
  MailquiltApi,
  "contacts",
  (handlers) =>
    handlers
      .handle("list", ({ params, query }) =>
        listContacts(Option.fromUndefinedOr(query.after)).pipe(
          asMemberOf(params.organizationId),
          signedIn
        )
      )
      .handle("create", ({ params, payload }) =>
        createContact(payload.email).pipe(
          asMemberOf(params.organizationId),
          signedIn
        )
      )
);
