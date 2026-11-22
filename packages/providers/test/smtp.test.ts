import { once } from "node:events";
import { createServer } from "node:net";
import type { AddressInfo, Socket } from "node:net";

import { assert, layer } from "@effect/vitest";
import type { OutgoingEmail, SmtpSettings } from "@repo/core";
import { outboundGuardLayer, SmtpProvider } from "@repo/core";
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

const failure = (
  smtp: SmtpSettings,
  to: string,
  options: { readonly blockPrivateNetworks?: boolean } = {}
) =>
  Effect.gen(function* sendFailure() {
    const error = yield* sendWith(smtp, emailTo(to), options).pipe(Effect.flip);

    return error.reason;
  });

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
        received: starttls.received,
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

  test.effect("checks the certificate of a host written with a trailing dot", () =>
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

  test.effect("says a server that doesn't answer is unreachable", () =>
    Effect.gen(function* closedPort() {
      const { plain } = yield* Mailpits;

      assert.strictEqual(
        yield* failure(
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

  test.effect("never repeats what a server that isn't SMTP says", () =>
    Effect.gen(function* notSmtp() {
      const port = yield* localServer((socket) => {
        socket.end("SSH-2.0-OpenSSH_9.6 internal-host\r\n");
      });

      const error = yield* sendWith(
        {
          credentials: Option.none(),
          server: { host: LOCAL_HOST, port, security: "none" },
        },
        emailTo("not-smtp@example.com")
      ).pipe(Effect.flip);

      assert.notInclude(error.detail, "OpenSSH");
      assert.notInclude(error.detail, "internal-host");
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

        assert.strictEqual(error.reason, "unreachable");
      })
  );
});
