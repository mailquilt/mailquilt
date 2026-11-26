import { MailquiltApi } from "@repo/contract";
import { Effect, Predicate } from "effect";
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

const RETRIES = 3;

/**
 * Whether a failed query is asked again: up to 3 times, but never after the
 * API refused it with `SignInRequired`, which another try can't change. The
 * query client's default; a query adds its own exceptions to it.
 */
export const retryUnlessSignedOut = (failures: number, error: Error) =>
  !Predicate.isTagged(error, "SignInRequired") && failures < RETRIES;

/**
 * Whether a query is loading for the first time: waiting, and never failed.
 * A page shows its loader only then. A retry after a failure keeps the
 * failure in place, so focus stays on its Try again.
 */
export const loadingFirstTime = (query: {
  readonly isPending: boolean;
  readonly errorUpdatedAt: number;
}) => query.isPending && query.errorUpdatedAt === 0;
