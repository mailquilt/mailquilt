import { X509Certificate } from "node:crypto";
import { readFileSync } from "node:fs";

import { assert, describe, it as plainIt, layer } from "@effect/vitest";
import { OutboundBlocked, OutboundGuard, SesNotifications } from "@repo/core";
import { Context, Effect, Layer, Option, Ref } from "effect";
import { HttpClient, HttpClientResponse } from "effect/http";
import { NetAddress } from "effect/net";

import { publicKeyOfCertificate, sesNotificationsLayer } from "../src/sns.ts";
import { makeSnsSigner, SNS_CERT_URL, sesBounce, sesComplaint } from "./sns.ts";

const SES_MESSAGE_ID =
  "0102018f2a7a6b7c-4f2d9c1e-8b3a-4c5d-9e6f-7a8b9c0d1e2f-000000";

const signer = makeSnsSigner();

const notification = (
  message: string,
  id = "11111111-2222-3333-4444-555555555555"
) => ({
  Message: message,
  MessageId: id,
  Timestamp: "2026-11-27T10:00:01.000Z",
  Type: "Notification" as const,
});

class SnsHost extends Context.Service<
  SnsHost,
  {
    readonly fetched: Effect.Effect<readonly string[]>;
    readonly block: (host: string) => Effect.Effect<void>;
  }
>()("test/SnsHost") {}

const SnsHostLive = Layer.effectContext(
  Effect.gen(function* snsHost() {
    const fetched = yield* Ref.make<readonly string[]>([]);
    const blocked = yield* Ref.make<ReadonlySet<string>>(new Set());

    const http = HttpClient.make((request) =>
      Effect.gen(function* answer() {
        yield* Ref.update(fetched, (earlier) => [...earlier, request.url]);

        const body =
          request.url === SNS_CERT_URL
            ? signer.certificate
            : "<ConfirmSubscriptionResponse/>";

        return HttpClientResponse.fromWeb(
          request,
          new Response(body, { status: 200 })
        );
      })
    );

    const guard = OutboundGuard.of({
      check: (host, port) =>
        Effect.gen(function* check() {
          if ((yield* Ref.get(blocked)).has(host)) {
            return yield* new OutboundBlocked({ host });
          }

          return NetAddress.inetAddressFromIpStringUnsafe("203.0.113.10", port);
        }),
    });

    const notifications = yield* Layer.build(
      sesNotificationsLayer.pipe(
        Layer.provide(Layer.succeed(HttpClient.HttpClient, http)),
        Layer.provide(Layer.succeed(OutboundGuard, guard))
      )
    );

    return Context.add(
      notifications,
      SnsHost,
      SnsHost.of({
        block: (host) =>
          Ref.update(blocked, (hosts) => new Set([...hosts, host])),
        fetched: Ref.get(fetched),
      })
    );
  })
);

layer(SnsHostLive)("SES notifications through SNS", (it) => {
  it.effect("reads a hard bounce from a message SNS signed", () =>
    Effect.gen(function* hardBounce() {
      const notifications = yield* SesNotifications;

      const message = yield* notifications.read(
        JSON.stringify(
          signer.sign(notification(sesBounce(SES_MESSAGE_ID, "Permanent")))
        )
      );

      assert.strictEqual(message.type, "Notification");
      assert.deepStrictEqual(
        message.type === "Notification" ? message.feedback : Option.none(),
        Option.some({ kind: "hard-bounce", providerMessageId: SES_MESSAGE_ID })
      );
    })
  );

  it.effect.each([
    {
      expected: Option.some("soft-bounce"),
      message: sesBounce(SES_MESSAGE_ID, "Transient"),
      name: "a transient bounce as soft",
    },
    {
      expected: Option.some("complaint"),
      message: sesComplaint(SES_MESSAGE_ID),
      name: "a complaint",
    },
    {
      expected: Option.some("hard-bounce"),
      message: JSON.stringify({
        bounce: { bounceType: "Permanent" },
        eventType: "Bounce",
        mail: { messageId: SES_MESSAGE_ID },
      }),
      name: "a configuration set's bounce event",
    },
    {
      expected: Option.none(),
      message: JSON.stringify({
        delivery: {},
        mail: { messageId: SES_MESSAGE_ID },
        notificationType: "Delivery",
      }),
      name: "nothing in a delivery",
    },
    {
      expected: Option.none(),
      message: "Hello from another service",
      name: "nothing in a message that isn't SES's",
    },
  ])("reads $name", ({ expected, message }) =>
    Effect.gen(function* feedbackOf() {
      const notifications = yield* SesNotifications;

      const read = yield* notifications.read(
        JSON.stringify(signer.sign(notification(message)))
      );

      assert.strictEqual(read.type, "Notification");
      assert.deepStrictEqual(
        read.type === "Notification"
          ? read.feedback.pipe(Option.map(({ kind }) => kind))
          : Option.none(),
        expected
      );
    })
  );

  it.effect(
    "reads a message signed with SHA-1, SNS's signature version 1",
    () =>
      Effect.gen(function* versionOne() {
        const notifications = yield* SesNotifications;

        const read = yield* notifications.read(
          JSON.stringify(
            signer.sign(notification(sesComplaint(SES_MESSAGE_ID)), {
              version: "1",
            })
          )
        );

        assert.strictEqual(read.type, "Notification");
      })
  );

  it.effect("refuses a message changed after SNS signed it", () =>
    Effect.gen(function* tampered() {
      const notifications = yield* SesNotifications;

      const signed = signer.sign(
        notification(sesBounce(SES_MESSAGE_ID, "Transient"))
      );

      const error = yield* notifications
        .read(
          JSON.stringify({
            ...signed,
            Message: sesBounce(SES_MESSAGE_ID, "Permanent"),
          })
        )
        .pipe(Effect.flip);

      assert.strictEqual(error._tag, "InvalidSnsMessage");
    })
  );

  it.effect("refuses a message signed with a key other than SNS's", () =>
    Effect.gen(function* forged() {
      const notifications = yield* SesNotifications;
      const forger = makeSnsSigner();

      const error = yield* notifications
        .read(
          JSON.stringify(
            forger.sign(notification(sesComplaint(SES_MESSAGE_ID)))
          )
        )
        .pipe(Effect.flip);

      assert.strictEqual(error._tag, "InvalidSnsMessage");
    })
  );

  it.effect("refuses a body that isn't an SNS message", () =>
    Effect.gen(function* unreadable() {
      const notifications = yield* SesNotifications;

      const error = yield* notifications
        .read('{"Type":"Notification"}')
        .pipe(Effect.flip);

      assert.strictEqual(error._tag, "InvalidSnsMessage");
    })
  );

  it.effect.each([
    {
      certUrl:
        "http://sns.eu-west-1.amazonaws.com/SimpleNotificationService-a.pem",
      name: "over plain HTTP",
    },
    {
      certUrl:
        "https://bucket.s3.amazonaws.com/SimpleNotificationService-a.pem",
      name: "on another amazonaws.com host",
    },
    {
      certUrl: "https://sns.eu-west-1.amazonaws.com.example.com/a.pem",
      name: "on a host that only starts like SNS's",
    },
    {
      certUrl: "https://sns.s3.amazonaws.com/a.pem",
      name: "in the S3 bucket named sns",
    },
    {
      certUrl: "https://sns.s3-us-west-2.amazonaws.com/a.pem",
      name: "in an S3 bucket named sns in a Region",
    },
    {
      certUrl: "https://sns.eu-west-1.amazonaws.com:8443/a.pem",
      name: "on another port",
    },
    {
      certUrl: "https://user@sns.eu-west-1.amazonaws.com/a.pem",
      name: "with a user name",
    },
    { certUrl: "not a URL", name: "that isn't a URL" },
  ])(
    "refuses a signing certificate $name, without fetching it",
    ({ certUrl }) =>
      Effect.gen(function* certificateHost() {
        const notifications = yield* SesNotifications;
        const host = yield* SnsHost;
        const before = yield* host.fetched;

        const error = yield* notifications
          .read(
            JSON.stringify(
              signer.sign(notification(sesComplaint(SES_MESSAGE_ID)), {
                certUrl,
              })
            )
          )
          .pipe(Effect.flip);

        assert.strictEqual(error._tag, "InvalidSnsMessage");
        assert.deepStrictEqual(yield* host.fetched, before);
      })
  );

  it.effect(
    "fetches a signing certificate once, and only from a host the outbound guard allows",
    () =>
      Effect.gen(function* throughTheGuard() {
        const notifications = yield* SesNotifications;
        const host = yield* SnsHost;

        const other =
          "https://sns.ap-south-1.amazonaws.com/SimpleNotificationService-b.pem";

        yield* notifications.read(
          JSON.stringify(
            signer.sign(notification(sesComplaint(SES_MESSAGE_ID)))
          )
        );
        yield* notifications.read(
          JSON.stringify(
            signer.sign(notification(sesComplaint(SES_MESSAGE_ID)))
          )
        );
        yield* host.block("sns.ap-south-1.amazonaws.com");

        const error = yield* notifications
          .read(
            JSON.stringify(
              signer.sign(notification(sesComplaint(SES_MESSAGE_ID)), {
                certUrl: other,
              })
            )
          )
          .pipe(Effect.flip);

        const fetched = yield* host.fetched;

        assert.strictEqual(error._tag, "SnsUnreachable");
        assert.strictEqual(
          fetched.filter((url) => url === SNS_CERT_URL).length,
          1
        );
        assert.notInclude(fetched, other);
      })
  );

  it.effect("confirms a subscription by fetching its SNS subscribe URL", () =>
    Effect.gen(function* confirm() {
      const notifications = yield* SesNotifications;
      const host = yield* SnsHost;

      const subscribeUrl =
        "https://sns.eu-west-1.amazonaws.com/?Action=ConfirmSubscription&TopicArn=arn:aws:sns:eu-west-1:123456789012:ses-feedback&Token=2336412f37";

      const read = yield* notifications.read(
        JSON.stringify(
          signer.sign({
            Message: "You have chosen to subscribe to the topic.",
            MessageId: "22222222-2222-3333-4444-555555555555",
            SubscribeURL: subscribeUrl,
            Timestamp: "2026-11-27T10:00:01.000Z",
            Token: "2336412f37",
            Type: "SubscriptionConfirmation",
          })
        )
      );

      assert.deepStrictEqual(
        read.type === "SubscriptionConfirmation" ? read.subscribeUrl : "",
        subscribeUrl
      );

      yield* notifications.confirmSubscription(subscribeUrl);

      const refused = yield* notifications
        .confirmSubscription(
          "https://attacker.example.com/?Action=ConfirmSubscription"
        )
        .pipe(Effect.flip);

      const fetched = yield* host.fetched;

      assert.strictEqual(refused._tag, "InvalidSnsMessage");
      assert.include(fetched, subscribeUrl);
      assert.notInclude(
        fetched,
        "https://attacker.example.com/?Action=ConfirmSubscription"
      );
    })
  );
});

describe("An X.509 certificate's public key", () => {
  plainIt("is read from a certificate Amazon issued", () => {
    const pem = readFileSync(
      new URL("fixtures/sns-host-certificate.crt", import.meta.url),
      "utf-8"
    );

    const certificate = new X509Certificate(pem);

    const read = publicKeyOfCertificate(new Uint8Array(certificate.raw));

    assert.deepStrictEqual(
      read.pipe(Option.map((bytes) => Buffer.from(bytes).toString("base64"))),
      Option.some(
        certificate.publicKey
          .export({ format: "der", type: "spki" })
          .toString("base64")
      )
    );
  });

  plainIt("is none in bytes that aren't a certificate", () => {
    assert.isTrue(
      Option.isNone(
        publicKeyOfCertificate(Uint8Array.from([0x30, 0x82, 0xff, 0xff, 0x30]))
      )
    );
  });
});
