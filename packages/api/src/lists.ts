import { MailquiltApi } from "@repo/contract";
import {
  addToList,
  asMemberOf,
  createList,
  getList,
  listLists,
} from "@repo/core";
import { HttpApiBuilder } from "effect/http-api";

import { signedIn } from "./auth/signed-in.ts";

/** An Organization's Lists, for its members (ADR 0007). */
export const ListsHandlers = HttpApiBuilder.group(
  MailquiltApi,
  "lists",
  (handlers) =>
    handlers
      .handle("list", ({ params }) =>
        listLists.pipe(asMemberOf(params.organizationId), signedIn)
      )
      .handle("create", ({ params, payload }) =>
        createList(payload.name).pipe(
          asMemberOf(params.organizationId),
          signedIn
        )
      )
      .handle("get", ({ params }) =>
        getList(params.listId).pipe(asMemberOf(params.organizationId), signedIn)
      )
      .handle("addContacts", ({ params, payload }) =>
        addToList(params.listId, payload.contactIds).pipe(
          asMemberOf(params.organizationId),
          signedIn
        )
      )
);
