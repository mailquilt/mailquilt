import { MailquiltApi } from "@repo/contract";
import { SystemMailerOutbox } from "@repo/core/testing";
import { Effect } from "effect";
import { FetchHttpClient, HttpClient, HttpClientRequest } from "effect/http";
import { HttpApiClient } from "effect/http-api";

import { APP_URL, AppFetch, TRUSTED_IP_HEADER } from "./harness.ts";

export const PASSWORD = "correct horse battery staple";

const URL_IN_TEXT = /https?:\/\/\S+/u;

let uniqueCounter = 0;

export const uniqueEmail = () => {
  uniqueCounter += 1;

  return `person-${uniqueCounter}@example.com`;
};

export const uniqueIp = () => {
  uniqueCounter += 1;

  return `198.51.100.${uniqueCounter % 250}`;
};

/** A request to the app in process, from the dashboard's origin by default. */
export const send = (
  method: string,
  path: string,
  options: {
    readonly body?: object;
    readonly headers?: Readonly<Record<string, string>>;
  } = {}
) =>
  Effect.gen(function* sendRequest() {
    const fetch = yield* AppFetch;

    return yield* Effect.promise(() =>
      fetch(`${APP_URL}${path}`, {
        body: options.body === undefined ? null : JSON.stringify(options.body),
        headers: {
          "content-type": "application/json",
          origin: APP_URL,
          ...options.headers,
        },
        method,
      })
    );
  });

export const signIn = (
  email: string,
  password: string,
  ip: string,
  headers: Readonly<Record<string, string>> = {}
) =>
  send("POST", "/api/auth/sign-in/email", {
    body: { email, password },
    headers: { [TRUSTED_IP_HEADER]: ip, ...headers },
  });

export const signUp = (email: string) =>
  send("POST", "/api/auth/sign-up/email", {
    body: { email, name: "Ada", password: PASSWORD },
    headers: { [TRUSTED_IP_HEADER]: uniqueIp() },
  });

export const sessionCookie = (response: Response) =>
  response.headers
    .getSetCookie()
    .map((cookie) => cookie.split(";")[0])
    .join("; ");

/** The verification link the System Mailer sent to `email`. */
export const verificationLinkFor = (email: string) =>
  Effect.gen(function* verificationLink() {
    const outbox = yield* SystemMailerOutbox;
    const sent = (yield* outbox.sent).find((email_) => email_.to === email);

    return sent?.text.match(URL_IN_TEXT)?.[0];
  });

/** Signs up a new person, verifies their email and signs in. Returns the session cookie. */
export const signedInPerson = Effect.gen(function* signedInPerson() {
  const email = uniqueEmail();
  yield* signUp(email);

  const link = yield* verificationLinkFor(email);

  if (link === undefined) {
    return yield* Effect.die(new Error("No verification email was sent"));
  }

  yield* send("GET", link.slice(APP_URL.length));

  return sessionCookie(yield* signIn(email, PASSWORD, uniqueIp()));
});

/** The typed client generated from `contract`, sending `cookie` with every request. */
export const clientWithCookie = (cookie: string) =>
  Effect.gen(function* clientWithSession() {
    const fetch = yield* AppFetch;

    return yield* HttpApiClient.make(MailquiltApi, {
      baseUrl: APP_URL,
      transformClient: HttpClient.mapRequest(
        HttpClientRequest.setHeader("cookie", cookie)
      ),
    }).pipe(
      Effect.provide(FetchHttpClient.layer),
      Effect.provideService(FetchHttpClient.Fetch, fetch)
    );
  });

/** A newly signed-in person's typed client. */
export const signedInClient = signedInPerson.pipe(
  Effect.flatMap(clientWithCookie)
);
