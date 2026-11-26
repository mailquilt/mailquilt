import { assert } from "@effect/vitest";
import type { Vitest } from "@effect/vitest";
import type { OutgoingEmail, SentEmail } from "@repo/core";
import type { SendFailed } from "@repo/domain";
import { Array as Arr, Effect } from "effect";

import type { ReceivedEmail } from "./mailpit.ts";

/** A Provider adapter set up against a real or recorded inbox. */
export interface ProviderUnderTest {
  readonly send: (email: OutgoingEmail) => Effect.Effect<SentEmail, SendFailed>;
  readonly received: (to: string) => Effect.Effect<readonly ReceivedEmail[]>;
}

const EMAIL = {
  from: { email: "news@acme.example", name: "Acme News" },
  html: "<p>Hello <strong>Ada</strong></p>",
  replyTo: "replies@acme.example",
  subject: "This week at Acme",
  text: "Hello Ada",
} as const;

/**
 * What every Provider adapter must do, whichever Provider it sends through.
 * Each adapter's tests run it against their own inbox.
 */
export const providerContract = <R>(
  test: Vitest.MethodsNonLive<R>,
  provider: Effect.Effect<ProviderUnderTest, never, R>
) => {
  test.effect("delivers the email as written", () =>
    Effect.gen(function* deliversAsWritten() {
      const { received, send } = yield* provider;
      const to = "contract-delivery@example.com";

      yield* send({ ...EMAIL, to });

      const emails = yield* received(to);

      assert.strictEqual(emails.length, 1);

      const [email] = emails;

      assert.deepStrictEqual(email?.From, {
        Address: EMAIL.from.email,
        Name: EMAIL.from.name,
      });
      assert.deepStrictEqual(email?.To, [{ Address: to }]);
      assert.deepStrictEqual(email?.ReplyTo, [{ Address: EMAIL.replyTo }]);
      assert.strictEqual(email?.Subject, EMAIL.subject);
      assert.strictEqual(email?.Text.trim(), EMAIL.text);
      assert.include(email?.HTML, EMAIL.html);
    })
  );

  test.effect("sends the email's own headers, such as List-Unsubscribe", () =>
    Effect.gen(function* ownHeaders() {
      const { received, send } = yield* provider;
      const to = "contract-headers@example.com";

      yield* send({
        ...EMAIL,
        headers: {
          "List-Unsubscribe": "<https://mail.example.com/unsubscribe/token>",
          "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
        },
        to,
      });

      const [email] = yield* received(to);

      assert.deepStrictEqual(email?.headers["List-Unsubscribe"], [
        "<https://mail.example.com/unsubscribe/token>",
      ]);
      assert.deepStrictEqual(email?.headers["List-Unsubscribe-Post"], [
        "List-Unsubscribe=One-Click",
      ]);
    })
  );

  test.effect("returns the ID the message arrives with", () =>
    Effect.gen(function* messageId() {
      const { received, send } = yield* provider;
      const to = "contract-message-id@example.com";

      const sent = yield* send({ ...EMAIL, to });
      const emails = yield* received(to);

      assert.isTrue(Arr.isReadonlyArrayNonEmpty(emails));
      assert.strictEqual(sent.messageId, `<${emails[0]?.messageId}>`);
    })
  );
};
