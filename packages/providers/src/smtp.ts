import { connect, isIP } from "node:net";
import { rootCertificates } from "node:tls";
import type { ConnectionOptions } from "node:tls";

import { OutboundGuard, SmtpProvider } from "@repo/core";
import type {
  HostLookupFailed,
  HostNotFound,
  OutboundBlocked,
  OutgoingEmail,
  SmtpSettings,
} from "@repo/core";
import type { SendFailureReason } from "@repo/domain";
import { SendFailed } from "@repo/domain";
import { Duration, Effect, Layer, Option, Redacted, Schema } from "effect";
import { NetAddress } from "effect/net";
import { createTransport } from "nodemailer";
import type { SMTPTransportGetSocket } from "nodemailer/lib/smtp-transport";

const CONNECTION_TIMEOUT = Duration.seconds(10);

const GREETING_TIMEOUT = Duration.seconds(10);

const SOCKET_TIMEOUT = Duration.seconds(30);

/** The longest one email may take to send, looking up the host included. */
export const SEND_TIMEOUT_SECONDS = 60;

const TRAILING_DOT = /\.$/u;

const REASON_BY_CODE = new Map<string, SendFailureReason>([
  ["EAUTH", "auth"],
  ["ECONNECTION", "unreachable"],
  ["EDNS", "host-not-found"],
  ["EENVELOPE", "rejected"],
  ["EMESSAGE", "rejected"],
  ["ENOAUTH", "auth"],
  ["EREQUIRETLS", "tls"],
  ["ESOCKET", "unreachable"],
  ["ETIMEDOUT", "unreachable"],
  ["ETLS", "tls"],
]);

const CERTIFICATE_OR_HANDSHAKE_CODE =
  /CERT|SELF_SIGNED|UNABLE_TO_VERIFY|^ERR_TLS|^ERR_SSL/u;

// WARNING: `originalCode` holds the system's code Nodemailer replaced, such as a certificate error's; `message` quotes the server's reply.
const NodemailerError = Schema.Struct({
  code: Schema.optionalKey(Schema.String),
  command: Schema.optionalKey(Schema.String),
  originalCode: Schema.optionalKey(Schema.String),
  message: Schema.optionalKey(Schema.String),
});

const parseNodemailerError = Schema.decodeUnknownOption(NodemailerError);

const UNKNOWN_ERROR: typeof NodemailerError.Type = {};

const toSendFailed = (error: Option.Option<typeof NodemailerError.Type>) => {
  const {
    code = "",
    command,
    message,
    originalCode = "",
  } = Option.getOrElse(error, () => UNKNOWN_ERROR);

  const reason = CERTIFICATE_OR_HANDSHAKE_CODE.test(originalCode)
    ? "tls"
    : (REASON_BY_CODE.get(code) ?? "failed");

  // WARNING: a greeting that isn't SMTP is another service's banner, such as SSH on a private network; never repeat it to the member.
  if (code === "EPROTOCOL" && command === "CONN") {
    return new SendFailed({
      detail: "The server didn't answer as an SMTP server.",
      reason,
    });
  }

  return new SendFailed({
    detail: message ?? "The SMTP server didn't accept the email.",
    reason,
  });
};

const refused = (error: OutboundBlocked | HostNotFound | HostLookupFailed) => {
  if (error._tag === "OutboundBlocked") {
    return new SendFailed({
      detail: `${error.host} resolves to an address this deployment doesn't connect to.`,
      reason: "blocked",
    });
  }

  if (error._tag === "HostLookupFailed") {
    return new SendFailed({
      detail: `Couldn't look up ${error.host}: ${error.detail}`,
      reason: "unreachable",
    });
  }

  return new SendFailed({
    detail: `${error.host} has no address.`,
    reason: "host-not-found",
  });
};

/** Options for servers this deployment trusts beyond the public certificate authorities. */
export interface SmtpProviderOptions {
  /** PEM certificates to trust in addition to Node's own, such as a test server's. */
  readonly trustedCertificates?: string;
}

const tlsOptions = (host: string, options: SmtpProviderOptions) => {
  const tls: ConnectionOptions = { minVersion: "TLSv1.2" };

  // WARNING: the socket goes to the checked IP, so the certificate must be checked against the host name; Node takes no server name for an IP.
  if (isIP(host) === 0) {
    tls.servername = host.replace(TRAILING_DOT, "");
  }

  if (options.trustedCertificates !== undefined) {
    tls.ca = [...rootCertificates, options.trustedCertificates];
  }

  return tls;
};

const openedSocket = (ip: string, port: number) => {
  // WARNING: Workers' tls.connect checks a socket it opens itself against the IP, never `servername`, so TLS from the start to a checked IP fails there; upgrading an open socket checks `servername`.
  const getSocket: SMTPTransportGetSocket = (_options, handOver) => {
    handOver(null, { connection: connect(port, ip) });
  };

  return getSocket;
};

const transportFor = (
  { credentials, server }: SmtpSettings,
  address: NetAddress.InetAddress,
  options: SmtpProviderOptions
) => {
  const ip = NetAddress.formatIp(address.address);

  return createTransport({
    auth: credentials.pipe(
      Option.map(({ password, username }) => ({
        pass: Redacted.value(password),
        user: Redacted.value(username),
      })),
      Option.getOrUndefined
    ),
    connectionTimeout: Duration.toMillis(CONNECTION_TIMEOUT),
    getSocket:
      server.security === "tls" ? openedSocket(ip, address.port) : undefined,
    greetingTimeout: Duration.toMillis(GREETING_TIMEOUT),
    host: ip,
    ignoreTLS: server.security === "none",
    logger: false,
    port: address.port,
    requireTLS: server.security === "starttls",
    secure: server.security === "tls",
    socketTimeout: Duration.toMillis(SOCKET_TIMEOUT),
    tls: tlsOptions(server.host, options),
  });
};

const messageFor = (email: OutgoingEmail) => {
  const message: Parameters<ReturnType<typeof createTransport>["sendMail"]>[0] =
    {
      from:
        email.from.name === undefined
          ? email.from.email
          : { address: email.from.email, name: email.from.name },
      subject: email.subject,
      to: email.to,
    };

  if (email.text !== undefined) {
    message.text = email.text;
  }

  if (email.html !== undefined) {
    message.html = email.html;
  }

  if (email.replyTo !== undefined) {
    message.replyTo = email.replyTo;
  }

  return message;
};

/**
 * Sends through an SMTP server with Nodemailer, on Node and on Workers, whose
 * `node:net` and `node:tls` run on `connect()`. The host is checked
 * by the `OutboundGuard`, and the connection goes to the address it checked,
 * never to the host name again; TLS still verifies the certificate against
 * the host name (ADR 0010). Each email opens its own connection, closed
 * afterwards. A connection waits at most 10 seconds to open and for the
 * server's greeting, and 30 seconds for any reply, and a whole send,
 * looking up the host included, at most 60 seconds; giving up, or the request being cancelled, closes the
 * connection. Nothing is logged. On Workers, `trustedCertificates` can't be
 * used, and port 25 is blocked.
 */
export const smtpProviderLayer = (options: SmtpProviderOptions = {}) =>
  Layer.effect(
    SmtpProvider,
    Effect.gen(function* smtpProvider() {
      const guard = yield* OutboundGuard;

      return {
        parseNotifications: () => Effect.succeed([]),

        send: (settings, email) =>
          Effect.gen(function* send() {
            const address = yield* guard
              .check(settings.server.host, settings.server.port)
              .pipe(Effect.mapError(refused));

            const transport = transportFor(settings, address, options);

            const sent = yield* Effect.tryPromise({
              catch: (error) => toSendFailed(parseNodemailerError(error)),
              try: (signal) =>
                transport.sendMail({ ...messageFor(email), signal }),
            }).pipe(Effect.ensuring(Effect.sync(() => transport.close())));

            return { messageId: sent.messageId };
          }).pipe(
            Effect.timeoutOrElse({
              duration: Duration.seconds(SEND_TIMEOUT_SECONDS),
              orElse: () =>
                Effect.fail(
                  new SendFailed({
                    detail: `The server took longer than ${SEND_TIMEOUT_SECONDS} seconds to take the email.`,
                    reason: "unreachable",
                  })
                ),
            })
          ),
      };
    })
  );
