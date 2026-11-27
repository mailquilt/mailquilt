import { SendDeferred, SesProvider } from "@repo/core";
import type { OutgoingEmail, SesSettings } from "@repo/core";
import type { Sender } from "@repo/domain";
import { SendFailed } from "@repo/domain";
import { AwsV4Signer } from "aws4fetch";
import { Duration, Effect, Layer, Option, Redacted, Schema } from "effect";
import { HttpClient, HttpClientRequest, HttpClientResponse } from "effect/http";
import type { HttpClientError } from "effect/http";
import {
  encodeWord,
  isPlainText,
  quoteString,
} from "nodemailer/lib/mime-funcs";

const REQUEST_TIMEOUT = Duration.seconds(30);

const SEND_PATH = "/v2/email/outbound-emails";

const ACCOUNT_PATH = "/v2/email/account";

// oxlint-disable-next-line unicorn/text-encoding-identifier-case -- SES's API documents its charset as `UTF-8`.
const CHARSET = "UTF-8";

const ENCODED_WORD_LENGTH = 52;

const NEEDS_QUOTES = /[()<>@,;:\\".[\]]/u;

const LINE_BREAK = /[\r\n]/u;

const endpoint = (settings: SesSettings) =>
  `https://email.${settings.account.region}.amazonaws.com`;

// WARNING: a name with a line break would start a header of its own, so it's encoded like any name that isn't plain ASCII, never quoted.
const mailbox = ({ email, name }: typeof Sender.Type) => {
  if (name === undefined || name === "") {
    return email;
  }

  if (!isPlainText(name) || LINE_BREAK.test(name)) {
    return `${encodeWord(name, "Q", ENCODED_WORD_LENGTH)} <${email}>`;
  }

  return `${NEEDS_QUOTES.test(name) ? quoteString(name) : name} <${email}>`;
};

interface Content {
  readonly Charset: string;
  readonly Data: string;
}

const content = (data: string) =>
  ({ Charset: CHARSET, Data: data }) satisfies Content;

interface SendEmailRequest {
  readonly Content: {
    readonly Simple: {
      readonly Body: { Html?: Content; Text?: Content };
      readonly Headers: readonly {
        readonly Name: string;
        readonly Value: string;
      }[];
      readonly Subject: Content;
    };
  };
  readonly Destination: { readonly ToAddresses: readonly string[] };
  readonly FromEmailAddress: string;
  ReplyToAddresses?: readonly string[];
}

const sendEmailRequest = (email: OutgoingEmail) => {
  const request: SendEmailRequest = {
    Content: {
      Simple: {
        Body: {},
        Headers: Object.entries(email.headers ?? {}).map(([Name, Value]) => ({
          Name,
          Value,
        })),
        Subject: content(email.subject),
      },
    },
    Destination: { ToAddresses: [email.to] },
    FromEmailAddress: mailbox(email.from),
  };

  if (email.html !== undefined) {
    request.Content.Simple.Body.Html = content(email.html);
  }

  if (email.text !== undefined) {
    request.Content.Simple.Body.Text = content(email.text);
  }

  if (email.replyTo !== undefined) {
    request.ReplyToAddresses = [email.replyTo];
  }

  return JSON.stringify(request);
};

const Sent = Schema.Struct({ MessageId: Schema.String });

const Account = Schema.Struct({
  SendQuota: Schema.Struct({ MaxSendRate: Schema.Number }),
});

// WARNING: SES words some errors as `message` and some as `Message`; neither ever quotes the access key, so either can be shown to the member.
const ErrorBody = Schema.Struct({
  __type: Schema.optionalKey(Schema.String),
  message: Schema.optionalKey(Schema.String),
  Message: Schema.optionalKey(Schema.String),
});

const decodeSent = Schema.decodeUnknownEffect(Sent);

const decodeAccount = Schema.decodeUnknownEffect(Account);

const decodeErrorBody = Schema.decodeUnknownOption(
  Schema.fromJsonString(ErrorBody)
);

const AUTH_ERRORS = new Set([
  "AccessDeniedException",
  "ExpiredTokenException",
  "IncompleteSignature",
  "InvalidClientTokenId",
  "InvalidSignatureException",
  "MissingAuthenticationTokenException",
  "SignatureDoesNotMatch",
  "UnrecognizedClientException",
]);

// WARNING: only a reply that shows SES never took the email may be tried again; a 500, 502 or 504 may come after it was accepted, so it's failed, never retried.
const NOT_TAKEN_ERRORS = new Set([
  "LimitExceededException",
  "ThrottlingException",
  "TooManyRequestsException",
]);

const NOT_TAKEN_STATUSES = new Set([429, 503]);

// WARNING: these refuse every email the account sends, not one, so they're `auth`, a failure of the whole connection, and the rest of the batch is recorded with them untried.
const ACCOUNT_ERRORS = new Set([
  "AccountSuspendedException",
  "MailFromDomainNotVerifiedException",
  "SendingPausedException",
]);

const FORBIDDEN = 403;

const SERVER_ERROR = 500;

const CONNECT_FAILURE_CODES = new Set([
  "EAI_AGAIN",
  "ECONNREFUSED",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "ENOTFOUND",
  "UND_ERR_CONNECT_TIMEOUT",
]);

const MAX_CAUSE_DEPTH = 5;

const ErrorWithCause = Schema.Struct({
  code: Schema.optionalKey(Schema.String),
  message: Schema.optionalKey(Schema.String),
  cause: Schema.optionalKey(Schema.Unknown),
});

const decodeErrorWithCause = Schema.decodeUnknownOption(ErrorWithCause);

const causesOf = (error: HttpClientError.HttpClientError) => {
  const causes: (typeof ErrorWithCause.Type)[] = [];
  let next = decodeErrorWithCause(error.reason);

  while (Option.isSome(next) && causes.length < MAX_CAUSE_DEPTH) {
    causes.push(next.value);
    next = decodeErrorWithCause(next.value.cause);
  }

  return causes;
};

const errorTypeOf = (
  header: string | undefined,
  body: Option.Option<typeof ErrorBody.Type>
) => {
  const fromHeader = header?.split(":")[0];

  if (fromHeader !== undefined && fromHeader !== "") {
    return fromHeader;
  }

  return Option.match(body, {
    onNone: () => "",
    onSome: ({ __type = "" }) => __type.split("#").at(-1) ?? "",
  });
};

const refusal = (response: HttpClientResponse.HttpClientResponse) =>
  Effect.gen(function* refusalOf() {
    const text = yield* response.text.pipe(Effect.orElseSucceed(() => ""));
    const body = decodeErrorBody(text);
    const type = errorTypeOf(response.headers["x-amzn-errortype"], body);

    const words = body.pipe(
      Option.flatMap(({ message, Message }) =>
        Option.fromUndefinedOr(message ?? Message)
      ),
      Option.getOrElse(() => `SES answered ${response.status}.`)
    );

    const detail = type === "" ? words : `${type}: ${words}`;

    if (
      AUTH_ERRORS.has(type) ||
      ACCOUNT_ERRORS.has(type) ||
      response.status === FORBIDDEN
    ) {
      return new SendFailed({ detail, reason: "auth" });
    }

    if (NOT_TAKEN_ERRORS.has(type) || NOT_TAKEN_STATUSES.has(response.status)) {
      return new SendDeferred({
        everyEmail: true,
        failed: new SendFailed({ detail, reason: "failed" }),
      });
    }

    return new SendFailed({
      detail,
      reason: response.status >= SERVER_ERROR ? "failed" : "rejected",
    });
  });

// WARNING: a request that got no answer may have reached SES and been sent, so it's failed, never retried; only one that never connected, such as a failed host lookup, is put off.
const unanswered = (error: HttpClientError.HttpClientError) => {
  const causes = causesOf(error);
  const deepest = causes.at(-1);

  const detail = `SES didn't answer: ${deepest?.message ?? error.message}`;

  if (causes.some(({ code = "" }) => CONNECT_FAILURE_CODES.has(code))) {
    return new SendDeferred({
      everyEmail: true,
      failed: new SendFailed({ detail, reason: "unreachable" }),
    });
  }

  return new SendFailed({ detail, reason: "failed" });
};

const TIMED_OUT = new SendFailed({
  detail: `SES didn't answer within ${Duration.format(REQUEST_TIMEOUT)}.`,
  reason: "failed",
});

/**
 * Sends through Amazon SES's v2 API, each request signed with the
 * connection's access key by `aws4fetch`, which needs only `fetch`'s Web
 * Crypto, so the same adapter runs on Node and Workers. Requests go only to
 * SES's own endpoint for the connection's Region, through the `HttpClient`
 * each runtime provides.
 */
export const sesProviderLayer = Layer.effect(
  SesProvider,
  Effect.gen(function* sesProvider() {
    const http = yield* HttpClient.HttpClient;

    const request = (
      settings: SesSettings,
      method: "GET" | "POST",
      path: string,
      json?: string
    ) =>
      Effect.gen(function* signedRequest() {
        const url = `${endpoint(settings)}${path}`;

        const signed = yield* Effect.promise(() =>
          new AwsV4Signer({
            accessKeyId: Redacted.value(settings.credentials.accessKeyId),
            body: json ?? null,
            headers:
              json === undefined ? {} : { "content-type": "application/json" },
            method,
            region: settings.account.region,
            secretAccessKey: Redacted.value(
              settings.credentials.secretAccessKey
            ),
            service: "ses",
            url,
          }).sign()
        );

        const headers = Object.fromEntries(signed.headers.entries());

        const unsent = HttpClientRequest.make(method)(url).pipe(
          HttpClientRequest.setHeaders(headers)
        );

        return yield* http.execute(
          json === undefined
            ? unsent
            : HttpClientRequest.bodyText(unsent, json, "application/json")
        );
      });

    return {
      maxSendRate: (settings) =>
        request(settings, "GET", ACCOUNT_PATH).pipe(
          Effect.flatMap(HttpClientResponse.filterStatusOk),
          Effect.flatMap((response) => response.json),
          Effect.flatMap(decodeAccount),
          Effect.map((account) =>
            Option.some(account.SendQuota.MaxSendRate).pipe(
              Option.filter((rate) => rate > 0)
            )
          ),
          Effect.timeout(REQUEST_TIMEOUT),
          Effect.orElseSucceed(() => Option.none<number>())
        ),

      send: (settings, email) =>
        Effect.gen(function* send() {
          const response = yield* request(
            settings,
            "POST",
            SEND_PATH,
            sendEmailRequest(email)
          ).pipe(
            Effect.catchTag("HttpClientError", (error) =>
              Effect.fail(unanswered(error))
            )
          );

          if (response.status < 200 || response.status > 299) {
            return yield* refusal(response).pipe(Effect.flatMap(Effect.fail));
          }

          const sent = yield* response.json.pipe(
            Effect.flatMap(decodeSent),
            Effect.mapError(
              () =>
                new SendFailed({
                  detail: "SES accepted the email but didn't say its ID.",
                  reason: "failed",
                })
            )
          );

          return { messageId: sent.MessageId };
        }).pipe(
          Effect.timeout(REQUEST_TIMEOUT),
          Effect.catchTag("TimeoutError", () => Effect.fail(TIMED_OUT))
        ),
    };
  })
);
