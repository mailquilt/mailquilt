import { once } from "node:events";
import { createServer } from "node:net";
import type { AddressInfo, Socket } from "node:net";

import { assert, layer } from "@effect/vitest";
import type { OutgoingEmail, SmtpSettings } from "@repo/core";
import { OutboundGuard, outboundGuardLayer, SmtpProvider } from "@repo/core";
import type { SmtpSecurity } from "@repo/domain";
import { Effect, Fiber, Latch, Layer, Option, Redacted } from "effect";
import { AddressResolver, Dns } from "effect/net";
import { TestClock } from "effect/testing";

import { smtpProviderLayer } from "../src/smtp.ts";
import { providerContract } from "./contract.ts";
import {
  CERTIFICATE_HOST,
  MAILPIT_PASSWORD,
  MAILPIT_USERNAME,
  Mailpits,
  MailpitsLive,
} from "./mailpit.ts";
import type { Mailpit } from "./mailpit.ts";

const HOST_NOT_ON_CERTIFICATE = "other.test";

const LOCAL_HOST = "local.test";

const localServer = (onConnection: (socket: Socket) => void) =>
  Effect.acquireRelease(
    Effect.promise(async () => {
      const server = createServer(onConnection).listen(0, "127.0.0.1");
      await once(server, "listening");

      return server;
    }),
    (server) => Effect.sync(() => server.close())
  ).pipe(
    // SAFETY: a server listening on a TCP address reports it as an AddressInfo.
    Effect.map((server) => (server.address() as AddressInfo).port)
  );

const credentials = (password: string) =>
  Option.some({
    password: Redacted.make(password),
    username: Redacted.make(MAILPIT_USERNAME),
  });

const settings = (
  mailpit: Mailpit,
  security: SmtpSecurity,
  options: Partial<Pick<SmtpSettings, "credentials">> & { host?: string } = {}
) =>
  ({
    credentials: options.credentials ?? Option.none(),
    server: {
      host: options.host ?? CERTIFICATE_HOST,
      port: mailpit.port,
      security,
    },
  }) satisfies SmtpSettings;

const emailTo = (to: string) =>
  ({
    from: { email: "news@acme.example" },
    subject: "Hello",
    text: "Hello from Mailquilt",
    to,
  }) satisfies OutgoingEmail;

const sendWith = (
  smtp: SmtpSettings,
  email: OutgoingEmail,
  options: { readonly blockPrivateNetworks?: boolean } = {}
) =>
  Effect.gen(function* sendThroughAdapter() {
    const mailpits = yield* Mailpits;

    const adapter = smtpProviderLayer({
      trustedCertificates: mailpits.certificate,
    }).pipe(
      Layer.provide(
        outboundGuardLayer({
          blockPrivateNetworks: options.blockPrivateNetworks ?? false,
        })
      ),
      Layer.provide(AddressResolver.layer()),
      Layer.provide(
        Dns.layerStatic({
          hosts: {
            [CERTIFICATE_HOST]: [mailpits.starttls.host],
            [HOST_NOT_ON_CERTIFICATE]: [mailpits.starttls.host],
            [LOCAL_HOST]: ["127.0.0.1"],
          },
        }).pipe(Layer.orDie)
      )
    );

    return yield* Effect.gen(function* sendThroughProvider() {
      const provider = yield* SmtpProvider;

      return yield* provider.send(smtp, email);
    }).pipe(Effect.provide(adapter));
  });

const failedFor = (
  smtp: SmtpSettings,
  email: OutgoingEmail,
  options: { readonly blockPrivateNetworks?: boolean } = {}
) =>
  Effect.gen(function* sendFailedForGood() {
    const error = yield* sendWith(smtp, email, options).pipe(Effect.flip);

    if (error._tag === "SendDeferred") {
      return assert.fail(
        `Expected a failure for good, got ${error.failed.detail}`
      );
    }

    return error;
  });

const failure = (
  smtp: SmtpSettings,
  to: string,
  options: { readonly blockPrivateNetworks?: boolean } = {}
) =>
  failedFor(smtp, emailTo(to), options).pipe(
    Effect.map((error) => error.reason)
  );

const deferral = (smtp: SmtpSettings, to: string) =>
  Effect.gen(function* sendDeferral() {
    const error = yield* sendWith(smtp, emailTo(to)).pipe(Effect.flip);

    if (error._tag === "SendFailed") {
      return assert.fail(`Expected a deferral, got ${error.detail}`);
    }

    return error.failed.reason;
  });

const END_OF_DATA = "\r\n.\r\n";

const scriptedServer = (
  replyTo: (command: string) => string,
  afterMessage: (socket: Socket) => void
) =>
  localServer((socket) => {
    let message: string | undefined;

    socket.write("220 local.test ESMTP\r\n");
    socket.on("data", (chunk) => {
      if (message !== undefined) {
        message += chunk.toString();

        if (message.includes(END_OF_DATA)) {
          message = undefined;
          afterMessage(socket);
        }

        return;
      }

      for (const line of chunk.toString().split("\r\n").filter(Boolean)) {
        const command = line.split(" ")[0]?.toUpperCase() ?? "";

        if (command === "DATA") {
          message = "";
          socket.write("354 Go ahead\r\n");
        } else {
          socket.write(`${replyTo(command)}\r\n`);
        }
      }
    });
  });

const toLocal = (port: number) =>
  ({
    credentials: Option.none(),
    server: { host: LOCAL_HOST, port, security: "none" },
  }) satisfies SmtpSettings;

const everythingOk = (command: string) =>
  command === "QUIT" ? "221 Bye" : "250 OK";

layer(MailpitsLive, { timeout: "2 minutes" })("SMTP Provider", (test) => {
  providerContract(
    test,
    Effect.gen(function* starttlsMailpit() {
      const { starttls } = yield* Mailpits;

      const smtp = settings(starttls, "starttls", {
        credentials: credentials(MAILPIT_PASSWORD),
      });

      const provide = Effect.provideService(Mailpits, yield* Mailpits);

      return {
        received: (to: string) =>
          starttls.received(to).pipe(
            Effect.map((emails) =>
              emails.map((email) => ({
                ...email,
                messageId: `<${email.messageId}>`,
              }))
            )
          ),
        send: (email: OutgoingEmail) => sendWith(smtp, email).pipe(provide),
      };
    })
  );

  test.effect("sends over TLS from the start, and without encryption", () =>
    Effect.gen(function* tlsAndPlain() {
      const { plain, tls } = yield* Mailpits;

      yield* sendWith(settings(tls, "tls"), emailTo("over-tls@example.com"));
      yield* sendWith(
        settings(plain, "none", { credentials: credentials("anything") }),
        emailTo("in-plain@example.com")
      );

      assert.lengthOf(yield* tls.received("over-tls@example.com"), 1);
      assert.lengthOf(yield* plain.received("in-plain@example.com"), 1);
    })
  );

  test.effect(
    "sends from an email's bounce address as its envelope sender, and from its From address without one",
    () =>
      Effect.gen(function* envelopeSender() {
        const { plain } = yield* Mailpits;
        const smtp = settings(plain, "none");
        const bounceAddress = `${"0".repeat(78)}-1-${"a".repeat(16)}@bounces.mailquilt.example`;

        yield* sendWith(smtp, {
          ...emailTo("envelope-bounce@example.com"),
          bounceAddress,
        });
        yield* sendWith(smtp, emailTo("envelope-from@example.com"));

        const [withOne] = yield* plain.received("envelope-bounce@example.com");
        const [without] = yield* plain.received("envelope-from@example.com");

        assert.deepStrictEqual(withOne?.headers["Return-Path"], [
          `<${bounceAddress}>`,
        ]);
        assert.deepStrictEqual(without?.headers["Return-Path"], [
          `<${without?.From.Address}>`,
        ]);
      })
  );

  test.effect(
    "checks the certificate of a host written with a trailing dot",
    () =>
      Effect.gen(function* fullyQualifiedHost() {
        const { tls } = yield* Mailpits;

        yield* sendWith(
          settings(tls, "tls", { host: `${CERTIFICATE_HOST}.` }),
          emailTo("trailing-dot@example.com")
        );

        assert.lengthOf(yield* tls.received("trailing-dot@example.com"), 1);
      })
  );

  test.effect("says the server refused the credentials", () =>
    Effect.gen(function* wrongPassword() {
      const { starttls } = yield* Mailpits;

      assert.strictEqual(
        yield* failure(
          settings(starttls, "starttls", {
            credentials: credentials("wrong-password"),
          }),
          "wrong-password@example.com"
        ),
        "auth"
      );
    })
  );

  test.effect("says the server refused the recipient", () =>
    Effect.gen(function* refusedRecipient() {
      const { starttls } = yield* Mailpits;

      assert.strictEqual(
        yield* failure(
          settings(starttls, "starttls", {
            credentials: credentials(MAILPIT_PASSWORD),
          }),
          "ada@elsewhere.test"
        ),
        "rejected"
      );
    })
  );

  test.effect(
    "refuses STARTTLS on a server that doesn't offer it, rather than sending unencrypted",
    () =>
      Effect.gen(function* noStarttls() {
        const { plain } = yield* Mailpits;

        assert.strictEqual(
          yield* failure(
            settings(plain, "starttls"),
            "no-starttls@example.com"
          ),
          "tls"
        );
        assert.lengthOf(yield* plain.received("no-starttls@example.com"), 0);
      })
  );

  test.effect(
    "checks the certificate against the host name, though it connects to the checked address",
    () =>
      Effect.gen(function* wrongName() {
        const { starttls, tls } = yield* Mailpits;
        const smtpCredentials = credentials(MAILPIT_PASSWORD);

        assert.strictEqual(
          yield* failure(
            settings(starttls, "starttls", {
              credentials: smtpCredentials,
              host: HOST_NOT_ON_CERTIFICATE,
            }),
            "wrong-name@example.com"
          ),
          "tls"
        );
        assert.strictEqual(
          yield* failure(
            settings(tls, "tls", { host: HOST_NOT_ON_CERTIFICATE }),
            "wrong-name@example.com"
          ),
          "tls"
        );
      })
  );

  test.effect("never connects to a host the outbound guard blocks", () =>
    Effect.gen(function* blockedHost() {
      const { plain } = yield* Mailpits;

      assert.strictEqual(
        yield* failure(settings(plain, "none"), "blocked@example.com", {
          blockPrivateNetworks: true,
        }),
        "blocked"
      );
      assert.lengthOf(yield* plain.received("blocked@example.com"), 0);
    })
  );

  test.effect("says a host has no address", () =>
    Effect.gen(function* unknownHost() {
      const { plain } = yield* Mailpits;

      assert.strictEqual(
        yield* failure(
          settings(plain, "none", { host: "nowhere.test" }),
          "unknown-host@example.com"
        ),
        "host-not-found"
      );
    })
  );

  test.effect(
    "says a server that refuses the connection is unreachable, and that it can be tried again later",
    () =>
      Effect.gen(function* closedPort() {
        const { plain } = yield* Mailpits;

        assert.strictEqual(
          yield* deferral(
            {
              ...settings(plain, "none"),
              server: { host: CERTIFICATE_HOST, port: 1, security: "none" },
            },
            "closed-port@example.com"
          ),
          "unreachable"
        );
      })
  );

  test.effect(
    "says the email can be tried again later when the server answers that it can't take it now",
    () =>
      Effect.gen(function* busyMailbox() {
        const port = yield* scriptedServer(
          (command) =>
            command === "RCPT"
              ? "450 4.2.1 Mailbox busy, try again later"
              : everythingOk(command),
          (socket) => socket.write("250 OK\r\n")
        );

        assert.strictEqual(
          yield* deferral(toLocal(port), "busy@example.com"),
          "rejected"
        );
      })
  );

  test.effect(
    "never says to try again an email whose connection was lost after the message was sent, since the server may have taken it",
    () =>
      Effect.gen(function* lostAfterMessage() {
        const port = yield* scriptedServer(everythingOk, (socket) =>
          socket.destroy()
        );

        assert.strictEqual(
          yield* failure(toLocal(port), "lost@example.com"),
          "unreachable"
        );
      })
  );

  test.effect("never repeats what a server that isn't SMTP says", () =>
    Effect.gen(function* notSmtp() {
      const port = yield* localServer((socket) => {
        socket.end("SSH-2.0-OpenSSH_9.6 internal-host\r\n");
      });

      const error = yield* failedFor(
        toLocal(port),
        emailTo("not-smtp@example.com")
      );

      assert.notInclude(error.detail, "OpenSSH");
      assert.notInclude(error.detail, "internal-host");
    })
  );

  test.effect("counts looking up the host towards the 60 seconds", () =>
    Effect.gen(function* slowLookup() {
      const lookingUp = yield* Latch.make();

      const neverAnswers = Layer.succeed(OutboundGuard, {
        check: () => lookingUp.open.pipe(Effect.andThen(Effect.never)),
      });

      const sending = yield* Effect.gen(function* sendThroughProvider() {
        const provider = yield* SmtpProvider;

        return yield* provider.send(
          {
            credentials: Option.none(),
            server: { host: "slow-dns.test", port: 25, security: "none" },
          },
          emailTo("slow@example.com")
        );
      }).pipe(
        Effect.provide(smtpProviderLayer().pipe(Layer.provide(neverAnswers))),
        Effect.flip,
        Effect.forkChild
      );

      yield* lookingUp.await;
      yield* TestClock.adjust("61 seconds");

      const error = yield* Fiber.join(sending);

      assert.deepInclude(error, { _tag: "SendFailed", reason: "unreachable" });
    })
  );

  test.effect(
    "gives up on a server that stops answering, and closes the connection",
    () =>
      Effect.gen(function* silentServer() {
        const connected = yield* Latch.make();
        const closed = yield* Latch.make();

        const port = yield* localServer((socket) => {
          connected.openUnsafe();
          socket.on("close", () => closed.openUnsafe());
        });

        const sending = yield* sendWith(
          {
            credentials: Option.none(),
            server: { host: LOCAL_HOST, port, security: "none" },
          },
          emailTo("silent@example.com")
        ).pipe(Effect.flip, Effect.forkChild);

        yield* connected.await;
        yield* TestClock.adjust("61 seconds");

        const error = yield* Fiber.join(sending);
        yield* closed.await;

        assert.deepInclude(error, {
          _tag: "SendFailed",
          reason: "unreachable",
        });
      })
  );
});
