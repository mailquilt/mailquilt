import { MailquiltApi } from "@repo/contract";
import { Effect } from "effect";
import { FetchHttpClient } from "effect/http";
import { HttpApiClient } from "effect/http-api";

const apiClient = HttpApiClient.make(MailquiltApi).pipe(
  Effect.provide(FetchHttpClient.layer)
);

type ApiClient = Effect.Success<typeof apiClient>;

/**
 * Runs one call of the typed client generated from `contract`, as a promise
 * for TanStack Query. The client has no base URL, so it calls the origin that
 * served the dashboard. A failure rejects with the endpoint's typed error, and
 * aborting the query interrupts the request.
 */
export const callApi = <A, E>(
  call: (client: ApiClient) => Effect.Effect<A, E>,
  signal?: AbortSignal
) => Effect.runPromise(apiClient.pipe(Effect.flatMap(call)), { signal });
