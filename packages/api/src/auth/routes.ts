import { Effect, Option } from "effect";
import { HttpRouter, HttpServerRequest, HttpServerResponse } from "effect/http";

import { AUTH_BASE_PATH, isAllowedAuthEndpoint } from "./allow-list.ts";
import { CLIENT_IP_HEADER, makeAuth } from "./better-auth.ts";
import { AuthConfig } from "./config.ts";

const notFound = HttpServerResponse.empty({ status: 404 });

const clientIpFromHeaderOrPeer = (
  request: HttpServerRequest.HttpServerRequest,
  header: Option.Option<string>
) =>
  Option.match(header, {
    onNone: () => request.remoteAddress,
    onSome: (name) => Option.fromNullishOr(request.headers[name]),
  });

const forwardedHeaders = (
  request: HttpServerRequest.HttpServerRequest,
  ip: Option.Option<string>
) => {
  const headers = new Headers(Object.entries(request.headers));

  headers.delete(CLIENT_IP_HEADER);

  if (Option.isSome(ip)) {
    headers.set(CLIENT_IP_HEADER, ip.value);
  }

  return headers;
};

const handleAuthRequest = Effect.gen(function* handleAuthRequest() {
  const request = yield* HttpServerRequest.HttpServerRequest;
  const config = yield* AuthConfig;
  const url = new URL(request.url, config.appUrl);
  const path = url.pathname.slice(AUTH_BASE_PATH.length);

  if (!isAllowedAuthEndpoint(request.method, path)) {
    return notFound;
  }

  const body = request.method === "GET" ? null : yield* request.arrayBuffer;
  const auth = yield* makeAuth;

  const response = yield* Effect.promise(() =>
    auth.handler(
      new Request(url, {
        body,
        headers: forwardedHeaders(
          request,
          clientIpFromHeaderOrPeer(request, config.clientIpHeader)
        ),
        method: request.method,
      })
    )
  );

  return HttpServerResponse.fromWeb(response);
});

/**
 * Better Auth under `/api/auth`, behind our allow list. A request for any
 * other Better Auth endpoint gets 404 here and never reaches Better Auth.
 */
export const AuthRoutes = HttpRouter.add(
  "*",
  `${AUTH_BASE_PATH}/*`,
  handleAuthRequest
);
