import { assert, layer } from "@effect/vitest";
import { CloudflareEmailProvider } from "@repo/core";
import type {
  CloudflareEmailSettings,
  OutgoingEmail,
  SendDeferred,
} from "@repo/core";
import type { SendFailed } from "@repo/domain";
import { Context, Effect, Layer, Option, Redacted, Ref, Schema } from "effect";
import { HttpClient, HttpClientError, HttpClientResponse } from "effect/http";
import type { HttpClientRequest } from "effect/http";

import { cloudflareEmailProviderLayer } from "../src/cloudflare-email.ts";
import { providerContract } from "./contract.ts";
import type { ReceivedEmail } from "./mailpit.ts";

const ACCOUNT_ID = "023e105f4ecef8ad9ca31a8372d0c353";

const API_TOKEN = "test-cloudflare-api-token";

const SETTINGS: CloudflareEmailSettings = {
  account: { accountId: ACCOUNT_ID },
  credentials: { apiToken: Redacted.make(API_TOKEN) },
};

const SEND_URL = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/email/sending/send`;

const MESSAGE_ID = "<aB3xK9mP2qR5sT8uV0wX1yZ4cD6fG7hJ9kL0@acme.example>";

interface RecordedResponse {
  readonly status: number;
  readonly body: string;
}

const HUNG_UP = new Error("socket hang up");

const HOST_NOT_FOUND = new TypeError("fetch failed", {
  cause: Object.assign(new Error("getaddrinfo ENOTFOUND api.cloudflare.com"), {
    code: "ENOTFOUND",
  }),
});

const sent = (result: {
  readonly delivered?: readonly string[];
  readonly permanent_bounces?: readonly string[];
  readonly suppressed_recipients?: readonly string[];
  readonly message_id?: string;
}) =>
  ({
    body: JSON.stringify({
      errors: [],
      messages: [],
      result: {
        delivered: [],
        permanent_bounces: [],
        queued: [],
        ...result,
      },
      success: true,
    }),
    status: 200,
  }) satisfies RecordedResponse;

const SENT = sent({ delivered: ["ada@example.com"], message_id: MESSAGE_ID });

const refused = (status: number, code: number, message: string) =>
  ({
    body: JSON.stringify({
      errors: [{ code, message }],
      messages: [],
      result: null,
      success: false,
    }),
    status,
  }) satisfies RecordedResponse;

interface RecordedRequest {
  readonly request: HttpClientRequest.HttpClientRequest;
  readonly body: unknown;
}

class CloudflareEndpoint extends Context.Service<
  CloudflareEndpoint,
  {
    readonly requests: Effect.Effect<readonly RecordedRequest[]>;
    readonly answerNextWith: (
      response: RecordedResponse | "unanswered" | "unreachable"
    ) => Effect.Effect<void>;
  }
>()("test/CloudflareEndpoint") {}

const decodeJson = Schema.decodeUnknownSync(
  Schema.fromJsonString(Schema.Unknown)
);

const bodyOf = (request: HttpClientRequest.HttpClientRequest) =>
  request.body._tag === "Uint8Array" && request.body.text !== undefined
    ? decodeJson(request.body.text)
    : undefined;

const CloudflareEndpointLive = Layer.effectContext(
  Effect.gen(function* cloudflareEndpoint() {
    const requests = yield* Ref.make<readonly RecordedRequest[]>([]);

    const next = yield* Ref.make(
      Option.none<RecordedResponse | "unanswered" | "unreachable">()
    );

    const http = HttpClient.make((request) =>
      Effect.gen(function* answer() {
        yield* Ref.update(requests, (earlier) => [
          ...earlier,
          { body: bodyOf(request), request },
        ]);

        const response = Option.getOrElse(
          yield* Ref.getAndSet(next, Option.none()),
          () => SENT
        );

        if (response === "unanswered" || response === "unreachable") {
          return yield* new HttpClientError.HttpClientError({
            reason: new HttpClientError.TransportError({
              cause: response === "unanswered" ? HUNG_UP : HOST_NOT_FOUND,
              request,
            }),
          });
        }

        return HttpClientResponse.fromWeb(
          request,
          new Response(response.body, {
            headers: { "content-type": "application/json" },
            status: response.status,
          })
        );
      })
    );

    return Context.make(HttpClient.HttpClient, http).pipe(
      Context.add(CloudflareEndpoint, {
        answerNextWith: (response) => Ref.set(next, Option.some(response)),
        requests: Ref.get(requests),
      })
    );
  })
);

const CloudflareLive = cloudflareEmailProviderLayer.pipe(
  Layer.provideMerge(CloudflareEndpointLive)
);

const Mailbox = Schema.Union([
  Schema.String,
  Schema.Struct({
    address: Schema.String,
    name: Schema.optionalKey(Schema.String),
  }),
]);

const isAddressOnly = Schema.is(Schema.String);

const SendRequest = Schema.Struct({
  from: Mailbox,
  to: Schema.String,
  reply_to: Schema.optionalKey(Schema.String),
  subject: Schema.String,
  html: Schema.optionalKey(Schema.String),
  text: Schema.optionalKey(Schema.String),
  headers: Schema.optionalKey(Schema.Record(Schema.String, Schema.String)),
});

const decodeSendRequest = Schema.decodeUnknownSync(SendRequest);

const asReceived = (email: typeof SendRequest.Type) =>
  ({
    From: isAddressOnly(email.from)
      ? { Address: email.from, Name: "" }
      : { Address: email.from.address, Name: email.from.name ?? "" },
    HTML: email.html ?? "",
    ReplyTo: email.reply_to === undefined ? [] : [{ Address: email.reply_to }],
    Subject: email.subject,
    Text: email.text ?? "",
    To: [{ Address: email.to }],
    headers: Object.fromEntries(
      Object.entries(email.headers ?? {}).map(([name, value]) => [
        name,
        [value],
      ])
    ),
    messageId: MESSAGE_ID,
  }) satisfies ReceivedEmail;

const EMAIL: OutgoingEmail = {
  from: { email: "news@acme.example", name: "Acme News" },
  subject: "This week at Acme",
  text: "Hello Ada",
  to: "ada@example.com",
};

const send = (email: OutgoingEmail = EMAIL) =>
  CloudflareEmailProvider.pipe(
    Effect.flatMap((cloudflare) => cloudflare.send(SETTINGS, email))
  );

const lastRequest = Effect.gen(function* lastRecordedRequest() {
  const requests = yield* (yield* CloudflareEndpoint).requests;
  const last = requests.at(-1);

  return { body: decodeSendRequest(last?.body), request: last?.request };
});

const outcomeOf = (outcome: SendFailed | SendDeferred) =>
  outcome._tag === "SendDeferred"
    ? [
        outcome.everyEmail === true ? "every email deferred" : "deferred",
        outcome.failed.reason,
        outcome.failed.detail,
      ]
    : ["failed", outcome.reason, outcome.detail];

layer(CloudflareLive)("Cloudflare Email Provider", (test) => {
  providerContract(
    test,
    Effect.gen(function* recordedCloudflare() {
      const endpoint = yield* CloudflareEndpoint;
      const cloudflare = yield* CloudflareEmailProvider;

      return {
        received: (to: string) =>
          endpoint.requests.pipe(
            Effect.map((requests) =>
              requests
                .map((recorded) => decodeSendRequest(recorded.body))
                .filter((email) => email.to === to)
                .map(asReceived)
            )
          ),
        send: (email: OutgoingEmail) => cloudflare.send(SETTINGS, email),
      };
    })
  );

  test.effect(
    "sends each email to Cloudflare's API for the connection's account, with its API token, to one recipient",
    () =>
      Effect.gen(function* sentToCloudflare() {
        yield* send();

        const { body, request } = yield* lastRequest;

        assert.strictEqual(request?.method, "POST");
        assert.strictEqual(request?.url, SEND_URL);
        assert.strictEqual(
          request?.headers.authorization,
          `Bearer ${API_TOKEN}`
        );
        assert.strictEqual(body.to, "ada@example.com");
      })
  );

  test.effect(
    "says why Cloudflare refused an email, and tries again later only when Cloudflare shows it didn't take it",
    () =>
      Effect.gen(function* refusals() {
        const endpoint = yield* CloudflareEndpoint;

        const outcomes = yield* Effect.forEach(
          [
            refused(400, 10_001, "email.sending.error.invalid_request_schema"),
            refused(
              403,
              10_102,
              "email.sending.error.authentication.forbidden"
            ),
            refused(
              403,
              10_208,
              "email.sending.error.email.recipient_plan_restricted"
            ),
            refused(429, 10_004, "email.sending.error.throttled"),
            refused(500, 10_002, "email.sending.error.internal_server"),
            { body: "<html>Bad gateway</html>", status: 502 },
            "unanswered" as const,
            "unreachable" as const,
          ],
          (response) =>
            endpoint
              .answerNextWith(response)
              .pipe(Effect.andThen(Effect.flip(send())))
        );

        assert.deepStrictEqual(outcomes.map(outcomeOf), [
          [
            "failed",
            "rejected",
            "10001: email.sending.error.invalid_request_schema",
          ],
          [
            "failed",
            "auth",
            "10102: email.sending.error.authentication.forbidden",
          ],
          [
            "failed",
            "rejected",
            "10208: email.sending.error.email.recipient_plan_restricted",
          ],
          [
            "every email deferred",
            "failed",
            "10004: email.sending.error.throttled",
          ],
          ["failed", "failed", "10002: email.sending.error.internal_server"],
          ["failed", "failed", "Cloudflare answered 502."],
          ["failed", "failed", "Cloudflare didn't answer: socket hang up"],
          [
            "every email deferred",
            "unreachable",
            "Cloudflare didn't answer: getaddrinfo ENOTFOUND api.cloudflare.com",
          ],
        ]);
      })
  );

  test.effect(
    "records an email Cloudflare accepted as failed when it says the address bounced for good or is on its suppression list",
    () =>
      Effect.gen(function* notSent() {
        const endpoint = yield* CloudflareEndpoint;

        const outcomes = yield* Effect.forEach(
          [
            sent({
              message_id: MESSAGE_ID,
              permanent_bounces: ["ada@example.com"],
            }),
            sent({ suppressed_recipients: ["ada@example.com"] }),
          ],
          (response) =>
            endpoint
              .answerNextWith(response)
              .pipe(
                Effect.andThen(
                  Effect.flip(send({ ...EMAIL, to: "Ada@Example.com" }))
                )
              )
        );

        assert.deepStrictEqual(outcomes.map(outcomeOf), [
          [
            "failed",
            "rejected",
            "Cloudflare says the address bounced for good.",
          ],
          [
            "failed",
            "rejected",
            "Cloudflare didn't send it, because the address is on its suppression list.",
          ],
        ]);
      })
  );

  test.effect(
    "sends the sender's name on one line, so it can't start a header of its own",
    () =>
      Effect.gen(function* senderName() {
        yield* send({
          ...EMAIL,
          from: {
            email: "news@acme.example",
            name: "Acme\r\nBcc: everyone@attacker.example",
          },
        });

        const { body } = yield* lastRequest;

        assert.deepStrictEqual(body.from, {
          address: "news@acme.example",
          name: "Acme Bcc: everyone@attacker.example",
        });
      })
  );
});
