import { MailquiltApi } from "@repo/contract";
import {
  addSuppressions,
  asMemberOf,
  listSuppressions,
  removeSuppression,
} from "@repo/core";
import { HttpApiBuilder } from "effect/http-api";

import { signedIn } from "./auth/signed-in.ts";

/** An Organization's Suppressions, for its members (ADR 0007). */
export const SuppressionsHandlers = HttpApiBuilder.group(
  MailquiltApi,
  "suppressions",
  (handlers) =>
    handlers
      .handle("list", ({ params, query }) =>
        listSuppressions(query).pipe(
          asMemberOf(params.organizationId),
          signedIn
        )
      )
      .handle("add", ({ params, payload }) =>
        addSuppressions(payload.emails).pipe(
          asMemberOf(params.organizationId),
          signedIn
        )
      )
      .handle("remove", ({ params }) =>
        removeSuppression(params.suppressionId).pipe(
          asMemberOf(params.organizationId),
          signedIn
        )
      )
);
