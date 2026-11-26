import { assert, layer } from "@effect/vitest";
import {
  MAX_SUPPRESSIONS_ADDED_AT_ONCE,
  SuppressionIdSchema,
} from "@repo/domain";
import { Effect } from "effect";
import { SqlClient } from "effect/sql";

import {
  clientWithCookie,
  ownOrganization,
  send,
  signedInPerson,
} from "./accounts.ts";
import { TestApp } from "./harness.ts";

const SUPPRESSION_ID = /^sup_[0-7][0-9a-hjkmnp-tv-z]{25}$/u;

const NO_SUCH_SUPPRESSION = SuppressionIdSchema.make(
  "sup_00000000000000000000000000"
);

layer(TestApp, { timeout: "2 minutes" })("Suppressions", (test) => {
  test.effect(
    "suppresses addresses by hand, each once whatever its case, and lists them newest first",
    () =>
      Effect.gen(function* addAndList() {
        const { client, params } = yield* ownOrganization;

        const first = yield* client.suppressions.add({
          params,
          payload: { emails: ["ada@example.com"] },
        });

        const second = yield* client.suppressions.add({
          params,
          payload: {
            emails: [
              "Ada@Example.COM",
              "grace@example.com",
              "GRACE@example.com",
            ],
          },
        });

        const page = yield* client.suppressions.list({ params, query: {} });

        assert.deepStrictEqual(
          { ...first },
          { added: 1, alreadySuppressed: 0 }
        );
        assert.deepStrictEqual(
          { ...second },
          { added: 1, alreadySuppressed: 1 }
        );
        assert.deepStrictEqual(
          page.suppressions.map(({ email, reason }) => [email, reason]),
          [
            ["grace@example.com", "manual"],
            ["ada@example.com", "manual"],
          ]
        );
        assert.match(page.suppressions[0]?.id ?? "", SUPPRESSION_ID);
        assert.strictEqual(page.total, 2);
        assert.isNull(page.next);
        assert.isNull(page.previous);
      })
  );

  test.effect(
    "removes a Suppression added by hand, but never one from a bounce or complaint",
    () =>
      Effect.gen(function* removeManualOnly() {
        const { client, params } = yield* ownOrganization;

        yield* client.suppressions.add({
          params,
          payload: {
            emails: [
              "bounced@example.com",
              "complained@example.com",
              "asked@example.com",
            ],
          },
        });

        const sql = yield* SqlClient.SqlClient;

        yield* sql`
          update suppressions
          set reason = case email
            when 'bounced@example.com' then 'hard-bounce'
            else 'complaint'
          end
          where organization_id = ${params.organizationId}
            and email <> 'asked@example.com'`;

        const before = yield* client.suppressions.list({ params, query: {} });

        const refused = [];

        for (const suppression of before.suppressions) {
          const removal = client.suppressions.remove({
            params: { ...params, suppressionId: suppression.id },
          });

          if (suppression.reason === "manual") {
            yield* removal;
          } else {
            refused.push((yield* Effect.flip(removal))._tag);
          }
        }

        const missing = yield* client.suppressions
          .remove({ params: { ...params, suppressionId: NO_SUCH_SUPPRESSION } })
          .pipe(Effect.flip);

        const after = yield* client.suppressions.list({ params, query: {} });

        assert.deepStrictEqual(refused, [
          "SuppressionNotRemovable",
          "SuppressionNotRemovable",
        ]);
        assert.strictEqual(missing._tag, "SuppressionNotFound");
        assert.deepStrictEqual(
          after.suppressions.map(({ email, reason }) => [email, reason]),
          [
            ["complained@example.com", "complaint"],
            ["bounced@example.com", "hard-bounce"],
          ]
        );
      })
  );

  test.effect(
    "refuses more than 250 addresses at once, and Suppresses none of them",
    () =>
      Effect.gen(function* tooMany() {
        const cookie = yield* signedInPerson;
        const client = yield* clientWithCookie(cookie);

        const organization = yield* client.organizations.create({
          payload: { name: "Acme" },
        });

        const emails = Array.from(
          { length: MAX_SUPPRESSIONS_ADDED_AT_ONCE + 1 },
          (_, index) => `reader-${index}@example.com`
        );

        const refused = yield* send(
          "POST",
          `/api/organizations/${organization.id}/suppressions`,
          { body: { emails }, headers: { cookie } }
        );

        const page = yield* client.suppressions.list({
          params: { organizationId: organization.id },
          query: {},
        });

        assert.strictEqual(refused.status, 400);
        assert.strictEqual(page.total, 0);
      })
  );
});
