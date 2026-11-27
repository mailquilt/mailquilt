import {
  InvalidSnsMessage,
  OutboundGuard,
  SesNotifications,
  SnsUnreachable,
} from "@repo/core";
import type { SesFeedback, SesFeedbackKind, SnsMessage } from "@repo/core";
import {
  DateTime,
  Duration,
  Effect,
  Layer,
  Option,
  Result,
  Schema,
  Stream,
} from "effect";
import { Digest, KeyFormat, SecureRandom, Signature } from "effect/crypto";
import { Base64 } from "effect/encoding";
import { HttpClient, HttpClientResponse } from "effect/http";

const HTTPS_PORT = 443;

const REQUEST_TIMEOUT = Duration.seconds(10);

const MAX_CERTIFICATE_BYTES = 16 * 1024;

const MAX_CACHED_CERTIFICATES = 32;

const RSA_MODULUS_BITS = 2048;

// WARNING: only SNS's own host in a Region, such as `sns.us-gov-west-1`; any looser rule lets an S3 bucket's host through, such as `sns.s3.amazonaws.com` (the bucket `sns`), and its owner sign their own messages.
const SNS_HOST = /^sns\.[a-z]{2}(?:-gov)?-[a-z]+-\d+\.amazonaws\.com$/u;

const EnvelopeSchema = Schema.Struct({
  Type: Schema.Literals([
    "Notification",
    "SubscriptionConfirmation",
    "UnsubscribeConfirmation",
  ]),
  MessageId: Schema.String,
  TopicArn: Schema.String,
  Subject: Schema.optionalKey(Schema.String),
  Message: Schema.String,
  Timestamp: Schema.String,
  SignatureVersion: Schema.Literals(["1", "2"]),
  Signature: Schema.String,
  SigningCertURL: Schema.String,
  SubscribeURL: Schema.optionalKey(Schema.String),
  Token: Schema.optionalKey(Schema.String),
});

type Envelope = typeof EnvelopeSchema.Type;

const decodeEnvelope = Schema.decodeUnknownOption(
  Schema.fromJsonString(EnvelopeSchema)
);

// WARNING: SNS signs these fields in this order, each as its name and value on lines of their own, leaving out any the message hasn't; any other order fails every signature.
const SIGNED_FIELDS = {
  Notification: [
    "Message",
    "MessageId",
    "Subject",
    "Timestamp",
    "TopicArn",
    "Type",
  ],
  SubscriptionConfirmation: [
    "Message",
    "MessageId",
    "SubscribeURL",
    "Timestamp",
    "Token",
    "TopicArn",
    "Type",
  ],
  UnsubscribeConfirmation: [
    "Message",
    "MessageId",
    "SubscribeURL",
    "Timestamp",
    "Token",
    "TopicArn",
    "Type",
  ],
} as const satisfies Record<Envelope["Type"], readonly (keyof Envelope)[]>;

const stringToSign = (envelope: Envelope) =>
  SIGNED_FIELDS[envelope.Type]
    .flatMap((key) => {
      const value = envelope[key];

      return value === undefined ? [] : [`${key}\n${value}\n`];
    })
    .join("");

// WARNING: SES writes `notificationType` for an identity's notifications and `eventType` for a configuration set's; the rest of the two is the same.
const SesEvent = Schema.Struct({
  notificationType: Schema.optionalKey(Schema.String),
  eventType: Schema.optionalKey(Schema.String),
  mail: Schema.Struct({ messageId: Schema.String }),
  bounce: Schema.optionalKey(Schema.Struct({ bounceType: Schema.String })),
});

const decodeSesEvent = Schema.decodeUnknownOption(
  Schema.fromJsonString(SesEvent)
);

const feedbackKind = (event: typeof SesEvent.Type) => {
  const type = event.notificationType ?? event.eventType;

  if (type === "Complaint") {
    return Option.some<SesFeedbackKind>("complaint");
  }

  if (type === "Bounce" && event.bounce !== undefined) {
    return Option.some<SesFeedbackKind>(
      event.bounce.bounceType === "Permanent" ? "hard-bounce" : "soft-bounce"
    );
  }

  return Option.none<SesFeedbackKind>();
};

const feedbackOf = (message: string) =>
  decodeSesEvent(message).pipe(
    Option.flatMap((event) =>
      feedbackKind(event).pipe(
        Option.map(
          (kind) =>
            ({
              kind,
              providerMessageId: event.mail.messageId,
            }) satisfies SesFeedback
        )
      )
    )
  );

const snsUrl = (text: string) => {
  const url = URL.parse(text);

  if (
    url === null ||
    url.protocol !== "https:" ||
    url.port !== "" ||
    url.username !== "" ||
    url.password !== "" ||
    !SNS_HOST.test(url.hostname)
  ) {
    return Option.none<URL>();
  }

  return Option.some(url);
};

const invalid = (detail: string) => new InvalidSnsMessage({ detail });

interface Tlv {
  readonly tag: number;
  readonly start: number;
  readonly contentStart: number;
  readonly end: number;
}

const MAX_LENGTH_BYTES = 4;

const LONG_FORM = 0x80;

const BYTE_VALUES = 0x1_00;

// WARNING: reads only as much DER as finding the public key needs; any malformed length or overrun is `None`, never a throw.
const readTlv = (bytes: Uint8Array, start: number, limit: number) => {
  const tag = bytes[start];
  const first = bytes[start + 1];

  if (tag === undefined || first === undefined) {
    return Option.none<Tlv>();
  }

  let length = first;
  let contentStart = start + 2;

  if (first >= LONG_FORM) {
    const count = first - LONG_FORM;
    const lengthBytes = bytes.subarray(contentStart, contentStart + count);

    if (count === 0 || count > MAX_LENGTH_BYTES || lengthBytes.length < count) {
      return Option.none<Tlv>();
    }

    length = 0;

    for (const byte of lengthBytes) {
      length = length * BYTE_VALUES + byte;
    }

    contentStart += count;
  }

  const end = contentStart + length;

  return end > limit
    ? Option.none<Tlv>()
    : Option.some<Tlv>({ contentStart, end, start, tag });
};

const SEQUENCE = 0x30;

const EXPLICIT_VERSION = 0xa0;

const KEY_FIELD = 5;

/**
 * The DER `SubjectPublicKeyInfo` of an X.509 certificate: the seventh field
 * of its `TBSCertificate` (the sixth when it has no version), or `None`
 * when the bytes aren't one. The
 * certificate's own signature isn't checked: it's trusted because it came
 * over HTTPS from SNS's host.
 */
export const publicKeyOfCertificate = (certificate: Uint8Array) =>
  Option.gen(function* publicKey() {
    const outer = yield* readTlv(certificate, 0, certificate.length);
    const tbs = yield* readTlv(certificate, outer.contentStart, outer.end);

    if (outer.tag !== SEQUENCE || tbs.tag !== SEQUENCE) {
      return yield* Option.none();
    }

    const fields: Tlv[] = [];
    let at = tbs.contentStart;

    while (at < tbs.end) {
      const field = yield* readTlv(certificate, at, tbs.end);

      fields.push(field);
      at = field.end;
    }

    const versioned = fields[0]?.tag === EXPLICIT_VERSION ? 1 : 0;
    const key = yield* Option.fromUndefinedOr(fields[KEY_FIELD + versioned]);

    if (key.tag !== SEQUENCE) {
      return yield* Option.none();
    }

    return certificate.slice(key.start, key.end);
  });

// WARNING: kept for the process or isolate, not the layer, as Workers builds the layer again for every request.
const certificates = new Map<string, Uint8Array>();

const PEM_BODY =
  /-----BEGIN CERTIFICATE-----(?<body>[\s\S]+?)-----END CERTIFICATE-----/u;

const WHITESPACE = /\s+/gu;

const derOfPem = (pem: string) => {
  const body = PEM_BODY.exec(pem)?.groups?.body;

  if (body === undefined) {
    return Option.none<Uint8Array>();
  }

  return Result.getSuccess(Base64.decode(body.replaceAll(WHITESPACE, "")));
};

const algorithmFor = (version: Envelope["SignatureVersion"]) =>
  Signature.rsaPkcs1v15({
    hash: version === "1" ? Digest.sha1 : Digest.sha256,
    modulusLength: RSA_MODULUS_BITS,
  });

const decodeUtf8 = (text: string) =>
  Result.getOrThrow(Base64.decode(Base64.encode(text)));

const boundedText = (
  response: HttpClientResponse.HttpClientResponse,
  limit: number
) =>
  response.stream.pipe(
    Stream.runFoldEffect(
      () => new Uint8Array(0),
      (read, chunk) =>
        read.length + chunk.length > limit
          ? Effect.fail(
              new SnsUnreachable({
                detail: `SNS's answer was over ${limit} bytes.`,
              })
            )
          : Effect.succeed(Uint8Array.from([...read, ...chunk]))
    ),
    Effect.mapError((failure) =>
      failure._tag === "HttpClientError"
        ? new SnsUnreachable({
            detail: `SNS's answer was cut off: ${failure.message}`,
          })
        : failure
    ),
    Effect.map((bytes) => Base64.decodeString(Base64.encode(bytes))),
    Effect.flatMap((text) =>
      Result.match(text, {
        onFailure: () =>
          Effect.fail(
            new SnsUnreachable({ detail: "SNS's answer wasn't text." })
          ),
        onSuccess: Effect.succeed,
      })
    )
  );

const messageOf = (envelope: Envelope) =>
  Effect.gen(function* message() {
    const timestamp = yield* DateTime.make(envelope.Timestamp).pipe(
      Effect.fromOption,
      Effect.mapError(() =>
        invalid(`The timestamp isn't a time: ${envelope.Timestamp}`)
      )
    );

    const base = {
      id: envelope.MessageId,
      timestamp: DateTime.toUtc(timestamp),
    };

    if (envelope.Type === "Notification") {
      return {
        ...base,
        feedback: feedbackOf(envelope.Message),
        type: envelope.Type,
      } satisfies SnsMessage;
    }

    if (envelope.Type === "UnsubscribeConfirmation") {
      return { ...base, type: envelope.Type } satisfies SnsMessage;
    }

    if (envelope.SubscribeURL === undefined) {
      return yield* invalid(
        "The subscription confirmation has no SubscribeURL."
      );
    }

    return {
      ...base,
      subscribeUrl: envelope.SubscribeURL,
      type: envelope.Type,
    } satisfies SnsMessage;
  });

/**
 * Reads SNS messages from an SES connection's topic. The signing
 * certificate and subscription URLs must be HTTPS on `sns.<region>.amazonaws.com`.
 * Each is fetched only after the outbound guard has checked the host, with
 * the `HttpClient` each runtime provides, which doesn't follow redirects;
 * a certificate is kept once read, for as long as the process or Workers
 * isolate runs, as SNS signs with one for months.
 */
export const sesNotificationsLayer = Layer.effect(
  SesNotifications,
  Effect.gen(function* sesNotifications() {
    const http = yield* HttpClient.HttpClient;
    const guard = yield* OutboundGuard;
    const signatures = yield* Signature.Signature;

    const get = (url: URL) =>
      Effect.gen(function* getFromSns() {
        yield* guard.check(url.hostname, HTTPS_PORT).pipe(
          Effect.mapError(
            (error) =>
              new SnsUnreachable({
                detail: `${url.hostname} can't be reached: ${error._tag}.`,
              })
          )
        );

        const response = yield* http.get(url.href).pipe(
          Effect.flatMap(HttpClientResponse.filterStatusOk),
          Effect.mapError(
            (error) =>
              new SnsUnreachable({
                detail: `SNS didn't answer: ${error.message}`,
              })
          )
        );

        return yield* boundedText(response, MAX_CERTIFICATE_BYTES);
      }).pipe(
        Effect.timeout(REQUEST_TIMEOUT),
        Effect.catchTag("TimeoutError", () =>
          Effect.fail(
            new SnsUnreachable({
              detail: `SNS didn't answer within ${Duration.format(REQUEST_TIMEOUT)}.`,
            })
          )
        )
      );

    const publicKeyAt = (url: URL) =>
      Effect.gen(function* publicKey() {
        const cached = certificates.get(url.href);

        if (cached !== undefined) {
          return cached;
        }

        const pem = yield* get(url);

        const spki = yield* derOfPem(pem).pipe(
          Option.flatMap(publicKeyOfCertificate),
          Effect.fromOption,
          Effect.mapError(() =>
            invalid("SNS's signing certificate couldn't be read.")
          )
        );

        if (certificates.size >= MAX_CACHED_CERTIFICATES) {
          certificates.clear();
        }

        certificates.set(url.href, spki);

        return spki;
      });

    const verify = (envelope: Envelope) =>
      Effect.gen(function* verifySignature() {
        const certUrl = yield* snsUrl(envelope.SigningCertURL).pipe(
          Effect.fromOption,
          Effect.mapError(() =>
            invalid(
              `The signing certificate isn't SNS's: ${envelope.SigningCertURL}`
            )
          )
        );

        const signature = yield* Result.getSuccess(
          Base64.decode(envelope.Signature)
        ).pipe(
          Effect.fromOption,
          Effect.mapError(() => invalid("The signature isn't base64."))
        );

        const spki = yield* publicKeyAt(certUrl);

        const key = yield* KeyFormat.decodePublic(
          KeyFormat.spki,
          algorithmFor(envelope.SignatureVersion),
          spki
        ).pipe(
          Effect.mapError(() =>
            invalid("SNS's signing certificate doesn't hold an RSA key.")
          )
        );

        const verified = yield* signatures
          .verify(key, signature, decodeUtf8(stringToSign(envelope)))
          .pipe(
            Effect.mapError((error) =>
              invalid(`The signature couldn't be checked: ${error.message}`)
            )
          );

        if (!verified) {
          return yield* invalid("The signature doesn't match the message.");
        }
      });

    return {
      confirmSubscription: (subscribeUrl) =>
        Effect.gen(function* confirmSubscription() {
          const url = yield* snsUrl(subscribeUrl).pipe(
            Effect.fromOption,
            Effect.mapError(() =>
              invalid(`The subscription URL isn't SNS's: ${subscribeUrl}`)
            )
          );

          yield* get(url);
        }),

      read: (body) =>
        Effect.gen(function* read() {
          const envelope = yield* decodeEnvelope(body).pipe(
            Effect.fromOption,
            Effect.mapError(() => invalid("The body isn't an SNS message."))
          );

          yield* verify(envelope);

          return yield* messageOf(envelope);
        }),
    };
  })
).pipe(
  Layer.provide(Signature.layerWebCrypto),
  Layer.provide(SecureRandom.layerWebCrypto)
);
