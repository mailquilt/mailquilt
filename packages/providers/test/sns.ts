import { createSign, generateKeyPairSync } from "node:crypto";

import { OutboundGuard } from "@repo/core";
import { Effect, Layer } from "effect";
import { HttpClient, HttpClientResponse } from "effect/http";
import { NetAddress } from "effect/net";

import { sesNotificationsLayer } from "../src/sns.ts";

/** Where the test signer's certificate is served, as SNS serves its own. */
export const SNS_CERT_URL =
  "https://sns.eu-west-1.amazonaws.com/SimpleNotificationService-0123456789abcdef0123456789abcdef.pem";

/** The topic test messages come from. */
export const TOPIC_ARN = "arn:aws:sns:eu-west-1:123456789012:ses-feedback";

/** A message as SNS posts it, before the fields only SNS adds. */
export interface UnsignedSnsMessage {
  readonly Type:
    | "Notification"
    | "SubscriptionConfirmation"
    | "UnsubscribeConfirmation";
  readonly MessageId: string;
  readonly Message: string;
  readonly Timestamp: string;
  readonly TopicArn?: string;
  readonly Subject?: string;
  readonly SubscribeURL?: string;
  readonly Token?: string;
}

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
} as const satisfies Record<
  UnsignedSnsMessage["Type"],
  readonly (keyof UnsignedSnsMessage)[]
>;

const der = (tag: number, content: Uint8Array) => {
  const { length } = content;
  let header: number[];

  if (length < 0x80) {
    header = [tag, length];
  } else if (length < 0x1_00) {
    header = [tag, 0x81, length];
  } else {
    header = [tag, 0x82, Math.floor(length / 0x1_00), length % 0x1_00];
  }

  return Uint8Array.from([...header, ...content]);
};

const sequence = (...parts: readonly Uint8Array[]) =>
  der(0x30, Uint8Array.from(parts.flatMap((part) => [...part])));

const ascii = (text: string) =>
  Uint8Array.from(text, (char) => char.codePointAt(0) ?? 0);

const SHA256_WITH_RSA = sequence(
  der(
    0x06,
    Uint8Array.from([0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x0b])
  ),
  Uint8Array.from([0x05, 0x00])
);

const NAME = sequence(
  der(
    0x31,
    sequence(
      der(0x06, Uint8Array.from([0x55, 0x04, 0x03])),
      der(0x0c, ascii("sns.amazonaws.com"))
    )
  )
);

// WARNING: the adapter reads only the certificate's public key, as SNS's own certificate is trusted for the HTTPS host it came from; so its signature here is empty.
const certificateOf = (spki: Uint8Array) => {
  const tbs = sequence(
    der(0xa0, der(0x02, Uint8Array.from([0x02]))),
    der(0x02, Uint8Array.from([0x01])),
    SHA256_WITH_RSA,
    NAME,
    sequence(
      der(0x17, ascii("260101000000Z")),
      der(0x17, ascii("360101000000Z"))
    ),
    NAME,
    spki
  );

  const body = sequence(
    tbs,
    SHA256_WITH_RSA,
    der(0x03, Uint8Array.from([0x00, 0x00]))
  );

  const base64 = Buffer.from(body).toString("base64");
  const lines = base64.match(/.{1,64}/gu) ?? [];

  return `-----BEGIN CERTIFICATE-----\n${lines.join("\n")}\n-----END CERTIFICATE-----\n`;
};

/**
 * Signs SNS messages as SNS does, with an RSA key made for the test run and
 * a certificate holding its public key, served at `SNS_CERT_URL`. No key is
 * kept in the repo.
 */
export const makeSnsSigner = () => {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
  });

  const certificate = certificateOf(
    new Uint8Array(publicKey.export({ format: "der", type: "spki" }))
  );

  const sign = (
    message: UnsignedSnsMessage,
    options: { readonly version?: "1" | "2"; readonly certUrl?: string } = {}
  ) => {
    const version = options.version ?? "2";

    const fields: UnsignedSnsMessage = { TopicArn: TOPIC_ARN, ...message };

    const signed = SIGNED_FIELDS[message.Type]
      .flatMap((key) => {
        const value = fields[key];

        return value === undefined ? [] : [`${key}\n${value}\n`];
      })
      .join("");

    const signature = createSign(version === "1" ? "RSA-SHA1" : "RSA-SHA256")
      .update(signed)
      .sign(privateKey, "base64");

    return {
      ...fields,
      Signature: signature,
      SignatureVersion: version,
      SigningCertURL: options.certUrl ?? SNS_CERT_URL,
    };
  };

  const fetched: string[] = [];

  return { certificate, fetched, sign };
};

/** SES's notification of a bounce, as SNS carries it in `Message`. */
export const sesBounce = (
  messageId: string,
  bounceType: "Permanent" | "Transient" | "Undetermined"
) =>
  JSON.stringify({
    bounce: {
      bounceSubType: bounceType === "Permanent" ? "General" : "MailboxFull",
      bounceType,
      bouncedRecipients: [{ emailAddress: "gone@example.com" }],
      feedbackId: "0102018f-feedback",
      timestamp: "2026-11-27T10:00:00.000Z",
    },
    mail: {
      destination: ["gone@example.com"],
      messageId,
      source: "news@example.com",
      timestamp: "2026-11-27T09:59:58.000Z",
    },
    notificationType: "Bounce",
  });

/** SES's notification of a complaint, as SNS carries it in `Message`. */
export const sesComplaint = (messageId: string) =>
  JSON.stringify({
    complaint: {
      complainedRecipients: [{ emailAddress: "angry@example.com" }],
      complaintFeedbackType: "abuse",
      feedbackId: "0102018f-feedback",
      timestamp: "2026-11-27T10:00:00.000Z",
    },
    mail: {
      destination: ["angry@example.com"],
      messageId,
      source: "news@example.com",
      timestamp: "2026-11-27T09:59:58.000Z",
    },
    notificationType: "Complaint",
  });

/**
 * The SES notifications adapter as it runs, reaching a fake SNS that
 * serves `signer`'s certificate and accepts every subscription, behind a
 * guard that allows SNS's hosts.
 */
export const sesNotificationsFor = (signer: ReturnType<typeof makeSnsSigner>) =>
  sesNotificationsLayer.pipe(
    Layer.provide(
      Layer.succeed(
        HttpClient.HttpClient,
        HttpClient.make((request) =>
          Effect.sync(() => {
            signer.fetched.push(request.url);

            return HttpClientResponse.fromWeb(
              request,
              new Response(
                request.url === SNS_CERT_URL
                  ? signer.certificate
                  : "<ConfirmSubscriptionResponse/>"
              )
            );
          })
        )
      )
    ),
    Layer.provide(
      Layer.succeed(
        OutboundGuard,
        OutboundGuard.of({
          check: (_host, port) =>
            Effect.succeed(
              NetAddress.inetAddressFromIpStringUnsafe("203.0.113.10", port)
            ),
        })
      )
    )
  );
