import { assert, layer } from "@effect/vitest";
import { PAGE_SIZE } from "@repo/db";
import { Contact } from "@repo/domain";
import { Effect, Schema } from "effect";

import {
  clientWithCookie,
  send,
  signedInClient,
  signedInPerson,
} from "./accounts.ts";
import { TestApp } from "./harness.ts";

const CONTACT_ID = /^cnt_[0-7][0-9a-hjkmnp-tv-z]{25}$/u;

const ownOrganization = Effect.gen(function* ownOrganization() {
  const client = yield* signedInClient;

  const organization = yield* client.organizations.create({
    payload: { name: "Acme" },
  });

  return { client, params: { organizationId: organization.id } };
});

layer(TestApp, { timeout: "2 minutes" })("Contacts", (test) => {
  test.effect("creates a Contact and lists it in its Organization", () =>
    Effect.gen(function* createAndList() {
      const { client, params } = yield* ownOrganization;

      const created = yield* client.contacts.create({
        params,
        payload: { email: "ada@example.com" },
      });

      assert.match(created.id, CONTACT_ID);
      assert.strictEqual(created.email, "ada@example.com");

      const page = yield* client.contacts.list({ params, query: {} });

      assert.deepStrictEqual(page.contacts, [created]);
    })
  );

  test.effect(
    "refuses a second Contact whose address differs only in case",
    () =>
      Effect.gen(function* duplicateEmail() {
        const { client, params } = yield* ownOrganization;

        yield* client.contacts.create({
          params,
          payload: { email: "ada@example.com" },
        });

        const error = yield* client.contacts
          .create({ params, payload: { email: "Ada@Example.COM" } })
          .pipe(Effect.flip);

        assert.strictEqual(error._tag, "ContactAlreadyExists");
      })
  );

  test.effect(
    "lets two Organizations each have a Contact with one address",
    () =>
      Effect.gen(function* sameEmailElsewhere() {
        const first = yield* ownOrganization;
        const second = yield* ownOrganization;

        yield* first.client.contacts.create({
          params: first.params,
          payload: { email: "ada@example.com" },
        });

        const created = yield* second.client.contacts.create({
          params: second.params,
          payload: { email: "ada@example.com" },
        });

        assert.strictEqual(created.email, "ada@example.com");
      })
  );

  test.effect(
    "trims spaces around an address and refuses a malformed one",
    () =>
      Effect.gen(function* checkedEmail() {
        const cookie = yield* signedInPerson;
        const client = yield* clientWithCookie(cookie);

        const organization = yield* client.organizations.create({
          payload: { name: "Acme" },
        });

        const path = `/api/organizations/${organization.id}/contacts`;

        const trimmed = yield* send("POST", path, {
          body: { email: "  ada@example.com  " },
          headers: { cookie },
        });

        const contact = yield* Effect.promise(() => trimmed.json()).pipe(
          Effect.flatMap(Schema.decodeUnknownEffect(Contact))
        );

        assert.strictEqual(trimmed.status, 201);
        assert.strictEqual(contact.email, "ada@example.com");

        const malformed = yield* send("POST", path, {
          body: { email: "ada at example.com" },
          headers: { cookie },
        });

        assert.strictEqual(malformed.status, 400);
      })
  );

  test.effect("pages through Contacts newest first", () =>
    Effect.gen(function* pages() {
      const { client, params } = yield* ownOrganization;

      const created = yield* Effect.forEach(
        Array.from({ length: PAGE_SIZE + 1 }, (_, index) => index),
        (index) =>
          client.contacts.create({
            params,
            payload: { email: `person-${index}@example.com` },
          })
      );

      const newestFirst = created.toSorted((a, b) => (a.id < b.id ? 1 : -1));

      const first = yield* client.contacts.list({ params, query: {} });

      assert.deepStrictEqual(first.contacts, newestFirst.slice(0, PAGE_SIZE));
      assert.isNotNull(first.next);

      const second = yield* client.contacts.list({
        params,
        query: { after: first.next ?? undefined },
      });

      assert.deepStrictEqual(second.contacts, newestFirst.slice(PAGE_SIZE));
      assert.isNull(second.next);
    })
  );
});
