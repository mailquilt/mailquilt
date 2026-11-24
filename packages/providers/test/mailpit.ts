import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { Context, Effect, Layer, Schema } from "effect";
import { GenericContainer, Wait } from "testcontainers";
import type { StartedTestContainer } from "testcontainers";

const MAILPIT_IMAGE =
  "axllent/mailpit:v1.33.1@sha256:aef2aacc11f075ec0fb6874275ee4a421e688e11a96ebb296134d1735c7761ce";

const SMTP_PORT = 1025;

const API_PORT = 8025;

/** The host name the test certificate is issued for. */
export const CERTIFICATE_HOST = "mail.test";

/** The only credentials the STARTTLS server accepts. */
export const MAILPIT_USERNAME = "mailquilt";

export const MAILPIT_PASSWORD = "correct-password";

/** Recipients the STARTTLS server accepts; any other is refused. */
export const ALLOWED_RECIPIENT_DOMAIN = "example.com";

const MessageSummary = Schema.Struct({
  ID: Schema.String,
  MessageID: Schema.String,
});

const Message = Schema.Struct({
  From: Schema.Struct({ Address: Schema.String, Name: Schema.String }),
  To: Schema.Array(Schema.Struct({ Address: Schema.String })),
  ReplyTo: Schema.Array(Schema.Struct({ Address: Schema.String })),
  Subject: Schema.String,
  Text: Schema.String,
  HTML: Schema.String,
});

export type ReceivedEmail = typeof Message.Type & {
  readonly messageId: string;
};

/** One running Mailpit: where its SMTP server listens, and the emails it received. */
export interface Mailpit {
  readonly host: string;
  readonly port: number;
  readonly received: (to: string) => Effect.Effect<readonly ReceivedEmail[]>;
}

const makeSelfSignedCertificate = () => {
  const directory = mkdtempSync(path.join(tmpdir(), "mailpit-tls-"));
  const certificate = path.join(directory, "cert.pem");
  const key = path.join(directory, "key.pem");

  execFileSync(
    "openssl",
    [
      "req",
      "-x509",
      "-newkey",
      "ec",
      "-pkeyopt",
      "ec_paramgen_curve:prime256v1",
      "-nodes",
      "-days",
      "1",
      "-subj",
      `/CN=${CERTIFICATE_HOST}`,
      "-addext",
      `subjectAltName=DNS:${CERTIFICATE_HOST}`,
      "-keyout",
      key,
      "-out",
      certificate,
    ],
    { stdio: "ignore" }
  );

  const pem = {
    certificate: readFileSync(certificate, "utf-8"),
    key: readFileSync(key, "utf-8"),
  };

  rmSync(directory, { force: true, recursive: true });

  return pem;
};

const fetchJson = (url: string) =>
  Effect.promise(async () => {
    const response = await fetch(url);
    const body: unknown = await response.json();

    return body;
  });

const toMailpit = (container: StartedTestContainer) => {
  const host = container.getHost();
  const api = `http://${host}:${container.getMappedPort(API_PORT)}/api/v1`;

  return {
    host: host === "localhost" ? "127.0.0.1" : host,
    port: container.getMappedPort(SMTP_PORT),
    received: (to) =>
      Effect.gen(function* received() {
        const search = yield* fetchJson(
          `${api}/search?query=${encodeURIComponent(`to:"${to}"`)}`
        );

        const { messages } = yield* Schema.decodeUnknownEffect(
          Schema.Struct({ messages: Schema.Array(MessageSummary) })
        )(search);

        return yield* Effect.all(
          messages.map((summary) =>
            fetchJson(`${api}/message/${summary.ID}`).pipe(
              Effect.flatMap(Schema.decodeUnknownEffect(Message)),
              Effect.map((message) => ({
                ...message,
                messageId: summary.MessageID,
              }))
            )
          )
        );
      }).pipe(Effect.orDie),
  } satisfies Mailpit;
};

const start = (
  environment: Readonly<Record<string, string>>,
  files: readonly { readonly content: string; readonly target: string }[]
) =>
  Effect.acquireRelease(
    Effect.promise(() =>
      new GenericContainer(MAILPIT_IMAGE)
        .withEnvironment({ MP_SMTP_DISABLE_RDNS: "true", ...environment })
        .withCopyContentToContainer(files.map((file) => ({ ...file })))
        .withExposedPorts(SMTP_PORT, API_PORT)
        .withWaitStrategy(Wait.forHttp("/readyz", API_PORT))
        .start()
    ),
    (container) => Effect.promise(() => container.stop())
  ).pipe(Effect.map(toMailpit));

/** Three Mailpit servers: STARTTLS with credentials, TLS from the start, and plain. */
export class Mailpits extends Context.Service<
  Mailpits,
  {
    /** STARTTLS required; signs in only `MAILPIT_USERNAME`; accepts only `ALLOWED_RECIPIENT_DOMAIN`. */
    readonly starttls: Mailpit;
    /** TLS from the first byte; any credentials or none. */
    readonly tls: Mailpit;
    /** No encryption; any credentials or none. */
    readonly plain: Mailpit;
    /** The certificate both TLS servers present, to trust in tests. */
    readonly certificate: string;
  }
>()("test/Mailpits") {}

export const MailpitsLive = Layer.effect(
  Mailpits,
  Effect.gen(function* mailpits() {
    const pem = makeSelfSignedCertificate();

    const tlsFiles = [
      { content: pem.certificate, target: "/tls/cert.pem" },
      { content: pem.key, target: "/tls/key.pem" },
    ];

    const tlsEnvironment = {
      MP_SMTP_TLS_CERT: "/tls/cert.pem",
      MP_SMTP_TLS_KEY: "/tls/key.pem",
    };

    const [starttls, tls, plain] = yield* Effect.all(
      [
        start(
          {
            ...tlsEnvironment,
            MP_SMTP_ALLOWED_RECIPIENTS: `@${ALLOWED_RECIPIENT_DOMAIN.replaceAll(".", "\\.")}$`,
            MP_SMTP_AUTH: `${MAILPIT_USERNAME}:${MAILPIT_PASSWORD}`,
            MP_SMTP_REQUIRE_STARTTLS: "true",
          },
          tlsFiles
        ),
        start(
          {
            ...tlsEnvironment,
            MP_SMTP_AUTH_ACCEPT_ANY: "true",
            MP_SMTP_REQUIRE_TLS: "true",
          },
          tlsFiles
        ),
        start(
          {
            MP_SMTP_AUTH_ACCEPT_ANY: "true",
            MP_SMTP_AUTH_ALLOW_INSECURE: "true",
          },
          []
        ),
      ],
      { concurrency: "unbounded" }
    );

    return { certificate: pem.certificate, plain, starttls, tls };
  })
);
