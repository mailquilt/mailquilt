import { assert, layer } from "@effect/vitest";
import { SesProvider } from "@repo/core";
import type { OutgoingEmail, SesSettings } from "@repo/core";
import { Context, Effect, Layer, Option, Redacted, Ref, Schema } from "effect";
import { HttpClient, HttpClientError, HttpClientResponse } from "effect/http";
import type { HttpClientRequest } from "effect/http";

import { sesProviderLayer } from "../src/ses.ts";
import { providerContract } from "./contract.ts";
import type { ReceivedEmail } from "./mailpit.ts";

const ACCESS_KEY_ID = "AKIAIOSFODNN7EXAMPLE";

const SETTINGS: SesSettings = {
  account: { region: "eu-west-1" },
  credentials: {
    accessKeyId: Redacted.make(ACCESS_KEY_ID),
    secretAccessKey: Redacted.make("wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"),
  },
};

const MESSAGE_ID =
  "0102018f2a7a6b7c-4f2d9c1e-8b3a-4c5d-9e6f-7a8b9c0d1e2f-000000";

const ERROR_TYPE_SUFFIX =
  ":http://internal.amazon.com/coral/com.amazonaws.sesv2/";

interface RecordedResponse {
  readonly status: number;
  readonly body: string;
  readonly errorType?: string;
}

const HUNG_UP = new Error("socket hang up");

const HOST_NOT_FOUND = new TypeError("fetch failed", {
  cause: Object.assign(
    new Error("getaddrinfo ENOTFOUND email.eu-west-1.amazonaws.com"),
    { code: "ENOTFOUND" }
  ),
});

const SENT: RecordedResponse = {
  body: JSON.stringify({ MessageId: MESSAGE_ID }),
  status: 200,
};

const ACCOUNT: RecordedResponse = {
  body: JSON.stringify({
    DedicatedIpAutoWarmupEnabled: false,
    EnforcementStatus: "HEALTHY",
    ProductionAccessEnabled: true,
    SendQuota: {
      Max24HourSend: 50_000,
      MaxSendRate: 14,
      SentLast24Hours: 12,
    },
    SendingEnabled: true,
  }),
  status: 200,
};

const refused = (status: number, errorType: string, message: string) =>
  ({
    body: JSON.stringify({ message }),
    errorType,
    status,
  }) satisfies RecordedResponse;

interface RecordedRequest {
  readonly request: HttpClientRequest.HttpClientRequest;
  readonly body: unknown;
}

class SesEndpoint extends Context.Service<
  SesEndpoint,
  {
    readonly requests: Effect.Effect<readonly RecordedRequest[]>;
    readonly answerNextWith: (
      response: RecordedResponse | "unanswered" | "unreachable"
    ) => Effect.Effect<void>;
  }
>()("test/SesEndpoint") {}

const decodeJson = Schema.decodeUnknownSync(
  Schema.fromJsonString(Schema.Unknown)
);

const bodyOf = (request: HttpClientRequest.HttpClientRequest) =>
  request.body._tag === "Uint8Array" && request.body.text !== undefined
    ? decodeJson(request.body.text)
    : undefined;

const SesEndpointLive = Layer.effectContext(
  Effect.gen(function* sesEndpoint() {
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

        const planned = yield* Ref.getAndSet(next, Option.none());

        const usual = request.url.endsWith("/v2/email/account")
          ? ACCOUNT
          : SENT;

        const response = Option.getOrElse(planned, () => usual);

        if (response === "unanswered" || response === "unreachable") {
          return yield* new HttpClientError.HttpClientError({
            reason: new HttpClientError.TransportError({
              cause: response === "unanswered" ? HUNG_UP : HOST_NOT_FOUND,
              request,
            }),
          });
        }

        const headers = new Headers({ "content-type": "application/json" });

        if (response.errorType !== undefined) {
          headers.set(
            "x-amzn-errortype",
            `${response.errorType}${ERROR_TYPE_SUFFIX}`
          );
        }

        return HttpClientResponse.fromWeb(
          request,
          new Response(response.body, { headers, status: response.status })
        );
      })
    );

    return Context.make(HttpClient.HttpClient, http).pipe(
      Context.add(SesEndpoint, {
        answerNextWith: (response) => Ref.set(next, Option.some(response)),
        requests: Ref.get(requests),
      })
    );
  })
);

const SesLive = sesProviderLayer.pipe(Layer.provideMerge(SesEndpointLive));

const NAME_ADDRESS = /^(?:"?(?<name>.*?)"?\s)?<(?<address>[^>]+)>$/u;

const SimpleEmail = Schema.Struct({
  Content: Schema.Struct({
    Simple: Schema.Struct({
      Body: Schema.Struct({
        Html: Schema.optionalKey(Schema.Struct({ Data: Schema.String })),
        Text: Schema.optionalKey(Schema.Struct({ Data: Schema.String })),
      }),
      Headers: Schema.Array(
        Schema.Struct({ Name: Schema.String, Value: Schema.String })
      ),
      Subject: Schema.Struct({ Data: Schema.String }),
    }),
  }),
  Destination: Schema.Struct({ ToAddresses: Schema.Array(Schema.String) }),
  FromEmailAddress: Schema.String,
  ReplyToAddresses: Schema.optionalKey(Schema.Array(Schema.String)),
});

const decodeSimpleEmail = Schema.decodeUnknownSync(SimpleEmail);

const asReceived = (email: typeof SimpleEmail.Type) => {
  const { Simple } = email.Content;
  const from = NAME_ADDRESS.exec(email.FromEmailAddress)?.groups;

  return {
    From: {
      Address: from?.address ?? email.FromEmailAddress,
      Name: from?.name ?? "",
    },
    HTML: Simple.Body.Html?.Data ?? "",
    ReplyTo: (email.ReplyToAddresses ?? []).map((Address) => ({ Address })),
    Subject: Simple.Subject.Data,
    Text: Simple.Body.Text?.Data ?? "",
    To: email.Destination.ToAddresses.map((Address) => ({ Address })),
    headers: Object.fromEntries(
      Simple.Headers.map(({ Name, Value }) => [Name, [Value]])
    ),
    messageId: MESSAGE_ID,
  } satisfies ReceivedEmail;
};

const sendsTo = (to: string) => (recorded: RecordedRequest) =>
  recorded.request.url.endsWith("/v2/email/outbound-emails") &&
  decodeSimpleEmail(recorded.body).Destination.ToAddresses.includes(to);

const EMAIL: OutgoingEmail = {
  from: { email: "news@acme.example", name: "Acme News" },
  subject: "This week at Acme",
  text: "Hello Ada",
  to: "ada@example.com",
};

const send = (email: OutgoingEmail = EMAIL) =>
  SesProvider.pipe(Effect.flatMap((ses) => ses.send(SETTINGS, email)));

const lastBody = Effect.gen(function* lastRequestBody() {
  const requests = yield* (yield* SesEndpoint).requests;

  return decodeSimpleEmail(requests.at(-1)?.body);
});

layer(SesLive)("SES Provider", (test) => {
  providerContract(
    test,
    Effect.gen(function* recordedSes() {
      const endpoint = yield* SesEndpoint;
      const ses = yield* SesProvider;

      return {
        received: (to: string) =>
          endpoint.requests.pipe(
            Effect.map((requests) =>
              requests
                .filter(sendsTo(to))
                .map((recorded) => asReceived(decodeSimpleEmail(recorded.body)))
            )
          ),
        send: (email: OutgoingEmail) => ses.send(SETTINGS, email),
      };
    })
  );

  test.effect(
    "signs each request for SES in the connection's Region with its access key, and sends it only to SES's endpoint there",
    () =>
      Effect.gen(function* signed() {
        yield* send();

        const [request] = (yield* (yield* SesEndpoint).requests).slice(-1);
        const authorization = request?.request.headers.authorization ?? "";

        assert.strictEqual(request?.request.method, "POST");
        assert.strictEqual(
          request?.request.url,
          "https://email.eu-west-1.amazonaws.com/v2/email/outbound-emails"
        );
        assert.match(
          authorization,
          new RegExp(
            `^AWS4-HMAC-SHA256 Credential=${ACCESS_KEY_ID}/\\d{8}/eu-west-1/ses/aws4_request, `,
            "u"
          )
        );
        assert.notInclude(
          JSON.stringify(request?.request.headers),
          Redacted.value(SETTINGS.credentials.secretAccessKey)
        );
      })
  );

  test.effect(
    "says why SES refused an email, and tries again later only when SES shows it didn't take it",
    () =>
      Effect.gen(function* refusals() {
        const endpoint = yield* SesEndpoint;

        const outcomes = yield* Effect.forEach(
          [
            refused(
              400,
              "MessageRejected",
              "Email address is not verified. The following identities failed the check in region EU-WEST-1: news@acme.example"
            ),
            refused(
              403,
              "InvalidSignatureException",
              "The request signature we calculated does not match the signature you provided."
            ),
            refused(
              429,
              "TooManyRequestsException",
              "Maximum sending rate exceeded."
            ),
            refused(503, "ServiceUnavailable", "Service unavailable."),
            refused(
              400,
              "SendingPausedException",
              "Email sending is disabled for your entire account."
            ),
            refused(500, "InternalFailure", "An internal error occurred."),
            "unanswered" as const,
            "unreachable" as const,
          ],
          (response) =>
            endpoint
              .answerNextWith(response)
              .pipe(Effect.andThen(Effect.flip(send())))
        );

        assert.deepStrictEqual(
          outcomes.map((outcome) =>
            outcome._tag === "SendDeferred"
              ? [
                  outcome.everyEmail === true
                    ? "every email deferred"
                    : "deferred",
                  outcome.failed.reason,
                  outcome.failed.detail,
                ]
              : ["failed", outcome.reason, outcome.detail]
          ),
          [
            [
              "failed",
              "rejected",
              "MessageRejected: Email address is not verified. The following identities failed the check in region EU-WEST-1: news@acme.example",
            ],
            [
              "failed",
              "auth",
              "InvalidSignatureException: The request signature we calculated does not match the signature you provided.",
            ],
            [
              "every email deferred",
              "failed",
              "TooManyRequestsException: Maximum sending rate exceeded.",
            ],
            [
              "every email deferred",
              "failed",
              "ServiceUnavailable: Service unavailable.",
            ],
            [
              "failed",
              "auth",
              "SendingPausedException: Email sending is disabled for your entire account.",
            ],
            [
              "failed",
              "failed",
              "InternalFailure: An internal error occurred.",
            ],
            ["failed", "failed", "SES didn't answer: socket hang up"],
            [
              "every email deferred",
              "unreachable",
              "SES didn't answer: getaddrinfo ENOTFOUND email.eu-west-1.amazonaws.com",
            ],
          ]
        );
      })
  );

  test.effect(
    "quotes a sender name with punctuation, and encodes one that isn't plain ASCII or has a line break",
    () =>
      Effect.gen(function* senderNames() {
        yield* send({
          ...EMAIL,
          from: { email: "news@acme.example", name: "Acme, Inc." },
        });

        const quoted = (yield* lastBody).FromEmailAddress;

        yield* send({
          ...EMAIL,
          from: { email: "news@acme.example", name: "Café Zoë" },
        });

        const encoded = (yield* lastBody).FromEmailAddress;

        yield* send({
          ...EMAIL,
          from: {
            email: "news@acme.example",
            name: "Acme\r\nBcc: everyone@attacker.example",
          },
        });

        const brokenLine = (yield* lastBody).FromEmailAddress;

        assert.strictEqual(quoted, '"Acme, Inc." <news@acme.example>');
        assert.notMatch(brokenLine, /[\r\n]/u);
        assert.match(brokenLine, /^=\?UTF-8\?Q\?.+ <news@acme\.example>$/u);
        assert.strictEqual(
          encoded,
          "=?UTF-8?Q?Caf=C3=A9_Zo=C3=AB?= <news@acme.example>"
        );
      })
  );

  test.effect(
    "reads the account's sending limit, or none when the access key may not read it",
    () =>
      Effect.gen(function* sendingLimit() {
        const ses = yield* SesProvider;
        const endpoint = yield* SesEndpoint;

        const limit = yield* ses.maxSendRate(SETTINGS);

        yield* endpoint.answerNextWith({
          body: JSON.stringify({
            Message:
              "User: arn:aws:iam::123456789012:user/mailquilt is not authorized to perform: ses:GetAccount",
          }),
          errorType: "AccessDeniedException",
          status: 403,
        });

        const denied = yield* ses.maxSendRate(SETTINGS);

        assert.deepStrictEqual(limit, Option.some(14));
        assert.deepStrictEqual(denied, Option.none());
      })
  );
});
