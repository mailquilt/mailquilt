import { CloudflareEmailProvider, SendDeferred } from "@repo/core";
import type { CloudflareEmailSettings, OutgoingEmail } from "@repo/core";
import type { Sender } from "@repo/domain";
import { SendFailed } from "@repo/domain";
import { Duration, Effect, Layer, Option, Redacted, Schema } from "effect";
import { HttpClient, HttpClientRequest } from "effect/http";
import type { HttpClientResponse } from "effect/http";

import { unanswered } from "./unanswered.ts";

const REQUEST_TIMEOUT = Duration.seconds(30);

const PROVIDER = "Cloudflare";

const sendUrl = (settings: CloudflareEmailSettings) =>
  `https://api.cloudflare.com/client/v4/accounts/${settings.account.accountId}/email/sending/send`;

const LINE_BREAKS = /[\r\n]+/gu;

// WARNING: Cloudflare writes the From header from this name; a line break in it could start a header of its own, so it's sent on one line.
const mailbox = ({ email, name }: typeof Sender.Type) =>
  name === undefined || name === ""
    ? email
    : { address: email, name: name.replaceAll(LINE_BREAKS, " ") };

interface SendRequest {
  readonly from: string | { readonly address: string; readonly name: string };
  readonly to: string;
  readonly subject: string;
  html?: string;
  text?: string;
  reply_to?: string;
  headers?: Readonly<Record<string, string>>;
}

const sendRequest = (email: OutgoingEmail) => {
  const request: SendRequest = {
    from: mailbox(email.from),
    subject: email.subject,
    to: email.to,
  };

  if (email.html !== undefined) {
    request.html = email.html;
  }

  if (email.text !== undefined) {
    request.text = email.text;
  }

  if (email.replyTo !== undefined) {
    request.reply_to = email.replyTo;
  }

  if (email.headers !== undefined) {
    request.headers = email.headers;
  }

  return JSON.stringify(request);
};

const Addresses = Schema.optionalKey(Schema.Array(Schema.String));

const Sent = Schema.Struct({
  result: Schema.Struct({
    message_id: Schema.optionalKey(Schema.String),
    permanent_bounces: Addresses,
    suppressed_recipients: Addresses,
  }),
});

const Refusal = Schema.Struct({
  errors: Schema.Array(
    Schema.Struct({ code: Schema.Number, message: Schema.String })
  ),
});

const decodeSent = Schema.decodeUnknownOption(Sent);

const decodeRefusal = Schema.decodeUnknownOption(
  Schema.fromJsonString(Refusal)
);

// WARNING: Free plans send only to addresses verified in the account; that refuses one recipient, not the connection, so the rest of the batch still goes to the verified ones.
const RECIPIENT_PLAN_RESTRICTED = 10_208;

// WARNING: only a reply that shows Cloudflare never took the email may be tried again; a 500, 502 or 504 may come after it was accepted, so it's failed, never retried.
const NOT_TAKEN_STATUSES = new Set([429, 503]);

// WARNING: these refuse the token or the account, so every email through the connection, not one; they're `auth`, and the rest of the batch is recorded with them untried.
const ACCOUNT_STATUSES = new Set([401, 403, 404]);

const SERVER_ERROR = 500;

const refusal = (response: HttpClientResponse.HttpClientResponse) =>
  Effect.gen(function* refusalOf() {
    const text = yield* response.text.pipe(Effect.orElseSucceed(() => ""));

    const errors = Option.match(decodeRefusal(text), {
      onNone: () => [],
      onSome: (body) => body.errors,
    });

    const detail =
      errors.length === 0
        ? `${PROVIDER} answered ${response.status}.`
        : errors.map(({ code, message }) => `${code}: ${message}`).join("; ");

    if (NOT_TAKEN_STATUSES.has(response.status)) {
      return new SendDeferred({
        everyEmail: true,
        failed: new SendFailed({ detail, reason: "failed" }),
      });
    }

    const recipientOnly = errors.some(
      ({ code }) => code === RECIPIENT_PLAN_RESTRICTED
    );

    if (ACCOUNT_STATUSES.has(response.status) && !recipientOnly) {
      return new SendFailed({ detail, reason: "auth" });
    }

    return new SendFailed({
      detail,
      reason: response.status >= SERVER_ERROR ? "failed" : "rejected",
    });
  });

const lists = (addresses: readonly string[] | undefined, to: string) =>
  (addresses ?? []).some(
    (address) => address.toLowerCase() === to.toLowerCase()
  );

const TIMED_OUT = new SendFailed({
  detail: `${PROVIDER} didn't answer within ${Duration.format(REQUEST_TIMEOUT)}.`,
  reason: "failed",
});

const NO_MESSAGE_ID = new SendFailed({
  detail: `${PROVIDER} accepted the email but didn't say its ID.`,
  reason: "failed",
});

/**
 * Sends through Cloudflare Email's REST API, one recipient to each request,
 * with the connection's API token, through the `HttpClient` each runtime
 * provides, so the same adapter runs on Node and Workers. Requests go only
 * to Cloudflare's own API. An email Cloudflare answers that it bounced for
 * good, or didn't send because the address is on its suppression list, is
 * refused; Cloudflare sends Mailquilt no bounces or complaints after that.
 */
export const cloudflareEmailProviderLayer = Layer.effect(
  CloudflareEmailProvider,
  Effect.gen(function* cloudflareEmailProvider() {
    const http = yield* HttpClient.HttpClient;

    return {
      send: (settings, email) =>
        Effect.gen(function* send() {
          const request = HttpClientRequest.post(sendUrl(settings)).pipe(
            HttpClientRequest.bearerToken(
              Redacted.value(settings.credentials.apiToken)
            ),
            HttpClientRequest.bodyText(sendRequest(email), "application/json")
          );

          const response = yield* http
            .execute(request)
            .pipe(
              Effect.catchTag("HttpClientError", (error) =>
                Effect.fail(unanswered(PROVIDER, error))
              )
            );

          if (response.status < 200 || response.status > 299) {
            return yield* refusal(response).pipe(Effect.flatMap(Effect.fail));
          }

          const { result } = yield* response.json.pipe(
            Effect.map(decodeSent),
            Effect.flatMap(Effect.fromOption),
            Effect.mapError(() => NO_MESSAGE_ID)
          );

          if (lists(result.permanent_bounces, email.to)) {
            return yield* new SendFailed({
              detail: `${PROVIDER} says the address bounced for good.`,
              reason: "rejected",
            });
          }

          if (lists(result.suppressed_recipients, email.to)) {
            return yield* new SendFailed({
              detail: `${PROVIDER} didn't send it, because the address is on its suppression list.`,
              reason: "rejected",
            });
          }

          if (result.message_id === undefined) {
            return yield* NO_MESSAGE_ID;
          }

          return { messageId: result.message_id };
        }).pipe(
          Effect.timeout(REQUEST_TIMEOUT),
          Effect.catchTag("TimeoutError", () => Effect.fail(TIMED_OUT))
        ),
    };
  })
);
