import { assert, layer } from "@effect/vitest";
import {
  Contact,
  ContactIdSchema,
  ListIdSchema,
  PAGE_SIZE,
} from "@repo/domain";
import { Effect, Schema } from "effect";
import { SqlClient } from "effect/sql";

import {
  clientWithCookie,
  ownOrganization,
  send,
  signedInPerson,
} from "./accounts.ts";
import { TestApp } from "./harness.ts";

const CONTACT_ID = /^cnt_[0-7][0-9a-hjkmnp-tv-z]{25}$/u;

const NO_SUCH_LIST = ListIdSchema.make("lst_00000000000000000000000000");

const OLDEST_ID = ContactIdSchema.make("cnt_00000000000000000000000000");

const NEWEST_ID = ContactIdSchema.make("cnt_7zzzzzzzzzzzzzzzzzzzzzzzzz");

const newestFirst = <Item extends { readonly id: string }>(
  items: readonly Item[]
) => items.toSorted((a, b) => (a.id < b.id ? 1 : -1));

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
      assert.deepStrictEqual(created.subscriptions, []);

      const page = yield* client.contacts.list({ params, query: {} });

      assert.deepStrictEqual(page.contacts, [created]);
      assert.strictEqual(page.total, 1);
      assert.strictEqual(page.start, 0);
      assert.isNull(page.previous);
      assert.isNull(page.next);
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
          Effect.flatMap(
            Schema.decodeUnknownEffect(Schema.toCodecJson(Contact))
          )
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

  test.effect("subscribes a new Contact to the Lists chosen with it", () =>
    Effect.gen(function* createSubscribed() {
      const { client, params } = yield* ownOrganization;

      const news = yield* client.lists.create({
        params,
        payload: { name: "Weekly news" },
      });

      const created = yield* client.contacts.create({
        params,
        payload: { email: "ada@example.com", listIds: [news.id] },
      });

      assert.deepStrictEqual(
        created.subscriptions.map(({ listId, status }) => ({ listId, status })),
        [{ listId: news.id, status: "subscribed" }]
      );
      assert.deepStrictEqual(
        (yield* client.contacts.list({ params, query: {} })).contacts,
        [created]
      );
    })
  );

  test.effect("creates no Contact when a chosen List doesn't exist", () =>
    Effect.gen(function* unknownList() {
      const { client, params } = yield* ownOrganization;

      const error = yield* client.contacts
        .create({
          params,
          payload: { email: "ada@example.com", listIds: [NO_SUCH_LIST] },
        })
        .pipe(Effect.flip);

      assert.strictEqual(error._tag, "ListNotFound");
      assert.strictEqual(
        (yield* client.contacts.list({ params, query: {} })).total,
        0
      );
    })
  );

  test.effect("pages through Contacts newest first, forward and back", () =>
    Effect.gen(function* pages() {
      const { client, params } = yield* ownOrganization;

      const created = newestFirst(
        yield* Effect.forEach(
          Array.from({ length: PAGE_SIZE + 1 }, (_, index) => index),
          (index) =>
            client.contacts.create({
              params,
              payload: { email: `person-${index}@example.com` },
            })
        )
      );

      const first = yield* client.contacts.list({ params, query: {} });

      assert.deepStrictEqual(first.contacts, created.slice(0, PAGE_SIZE));
      assert.strictEqual(first.total, PAGE_SIZE + 1);
      assert.strictEqual(first.start, 0);
      assert.isNull(first.previous);
      assert.isNotNull(first.next);

      const second = yield* client.contacts.list({
        params,
        query: { after: first.next ?? undefined },
      });

      assert.deepStrictEqual(second.contacts, created.slice(PAGE_SIZE));
      assert.strictEqual(second.start, PAGE_SIZE);
      assert.isNull(second.next);
      assert.isNotNull(second.previous);

      const back = yield* client.contacts.list({
        params,
        query: { before: second.previous ?? undefined },
      });

      assert.deepStrictEqual(back, first);
    })
  );

  test.effect("offers a cursor only toward Contacts that exist", () =>
    Effect.gen(function* cursorsWithNeighbours() {
      const { client, params } = yield* ownOrganization;

      const ada = yield* client.contacts.create({
        params,
        payload: { email: "ada@example.com" },
      });

      for (const query of [{ after: NEWEST_ID }, { before: OLDEST_ID }]) {
        const page = yield* client.contacts.list({ params, query });

        assert.deepStrictEqual(page.contacts, [ada]);
        assert.strictEqual(page.start, 0);
        assert.isNull(page.previous);
        assert.isNull(page.next);
      }
    })
  );

  test.effect(
    "shows the first page when a cursor passes every matching Contact",
    () =>
      Effect.gen(function* staleCursor() {
        const { client, params } = yield* ownOrganization;

        const ada = yield* client.contacts.create({
          params,
          payload: { email: "ada@example.com" },
        });

        for (const query of [{ after: OLDEST_ID }, { before: NEWEST_ID }]) {
          const page = yield* client.contacts.list({ params, query });

          assert.deepStrictEqual(page.contacts, [ada]);
          assert.strictEqual(page.start, 0);
          assert.strictEqual(page.total, 1);
          assert.isNull(page.previous);
          assert.isNull(page.next);
        }
      })
  );

  test.effect("filters Contacts by List, and by their status on it", () =>
    Effect.gen(function* filtered() {
      const { client, params } = yield* ownOrganization;

      const news = yield* client.lists.create({
        params,
        payload: { name: "Weekly news" },
      });

      const onNews = yield* Effect.forEach(
        ["ada@example.com", "grace@example.com"],
        (email) =>
          client.contacts.create({
            params,
            payload: { email, listIds: [news.id] },
          })
      );

      yield* client.contacts.create({
        params,
        payload: { email: "alan@example.com" },
      });
      const sql = yield* SqlClient.SqlClient;

      yield* sql`update subscriptions set status = 'unsubscribed' where contact_id = ${onNews[1]?.id ?? ""}`;

      const onList = yield* client.contacts.list({
        params,
        query: { list: news.id },
      });

      const unsubscribed = yield* client.contacts.list({
        params,
        query: { list: news.id, status: "unsubscribed" },
      });

      assert.deepStrictEqual(
        onList.contacts.map((contact) => contact.id),
        newestFirst(onNews).map((contact) => contact.id)
      );
      assert.strictEqual(onList.total, 2);
      assert.deepStrictEqual(
        unsubscribed.contacts.map((contact) => contact.email),
        ["grace@example.com"]
      );
      assert.strictEqual(unsubscribed.total, 1);
    })
  );

  test.effect(
    "answers a filter by a List it doesn't have with ListNotFound",
    () =>
      Effect.gen(function* missingList() {
        const { client, params } = yield* ownOrganization;

        const error = yield* client.contacts
          .list({ params, query: { list: NO_SUCH_LIST } })
          .pipe(Effect.flip);

        assert.strictEqual(error._tag, "ListNotFound");
      })
  );

  test.effect("refuses a status filter without a List", () =>
    Effect.gen(function* statusWithoutList() {
      const cookie = yield* signedInPerson;
      const client = yield* clientWithCookie(cookie);

      const organization = yield* client.organizations.create({
        payload: { name: "Acme" },
      });

      const response = yield* send(
        "GET",
        `/api/organizations/${organization.id}/contacts?status=pending`,
        { headers: { cookie } }
      );

      assert.strictEqual(response.status, 400);
    })
  );
});
