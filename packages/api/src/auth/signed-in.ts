import { CurrentUser } from "@repo/core";
import { SignInRequired, UserIdSchema } from "@repo/domain";
import { Effect } from "effect";
import { HttpServerRequest } from "effect/http";

import { makeAuth } from "./better-auth.ts";
import { AuthConfig } from "./config.ts";

const READ_ONLY_METHODS = new Set(["GET", "HEAD"]);

const isCrossOriginWrite = (
  request: HttpServerRequest.HttpServerRequest,
  appOrigin: string
) =>
  !READ_ONLY_METHODS.has(request.method) &&
  request.headers.origin !== undefined &&
  request.headers.origin !== appOrigin;

/**
 * Runs `effect` as the signed-in person, read from the request's Better Auth
 * session. Without a valid session it fails with `SignInRequired`. So does a
 * write whose `Origin` is another site: browsers always send `Origin` with a
 * write, and a page on another site, even under the same domain, must not
 * ride on the session cookie.
 */
export const signedIn = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  Effect.gen(function* signedInPerson() {
    const request = yield* HttpServerRequest.HttpServerRequest;
    const config = yield* AuthConfig;

    if (isCrossOriginWrite(request, config.appUrl)) {
      return yield* new SignInRequired();
    }

    const auth = yield* makeAuth;

    const session = yield* Effect.promise(() =>
      auth.api.getSession({
        headers: new Headers(Object.entries(request.headers)),
        query: { disableRefresh: true },
      })
    );

    if (session === null) {
      return yield* new SignInRequired();
    }

    return yield* effect.pipe(
      Effect.provideService(CurrentUser, {
        id: UserIdSchema.make(session.user.id),
      })
    );
  });
