import { assert, layer } from "@effect/vitest";
import { PAGE_SIZE } from "@repo/db";
import { ContactIdSchema, ListIdSchema } from "@repo/domain";
import { Effect } from "effect";
import { SqlClient } from "effect/sql";

import { signedInClient } from "./accounts.ts";
import { TestApp } from "./harness.ts";

const LIST_ID = /^lst_[0-7][0-9a-hjkmnp-tv-z]{25}$/u;

const SUBSCRIPTION_ID = /^sub_[0-7][0-9a-hjkmnp-tv-z]{25}$/u;

const NO_SUCH_LIST = ListIdSchema.make("lst_00000000000000000000000000");

const NO_SUCH_CONTACT = ContactIdSchema.make("cnt_00000000000000000000000000");

const ownOrganization = Effect.gen(function* ownOrganization() {
  const client = yield* signedInClient;

  const organization = yield* client.organizations.create({
    payload: { name: "Acme" },
  });

  return { client, params: { organizationId: organization.id } };
});

layer(TestApp, { timeout: "2 minutes" })("Lists", (test) => {
  test.effect("creates Lists and lists them oldest first", () =>
    Effect.gen(function* createAndList() {
      const { client, params } = yield* ownOrganization;

      const news = yield* client.lists.create({
        params,
        payload: { name: "Weekly news" },
      });

      const offers = yield* client.lists.create({
        params,
        payload: { name: "Offers" },
      });

      assert.match(news.id, LIST_ID);
      assert.strictEqual(news.name, "Weekly news");
      assert.deepStrictEqual(yield* client.lists.list({ params }), [
        news,
        offers,
      ]);
      assert.deepStrictEqual(
        yield* client.lists.get({ params: { ...params, listId: news.id } }),
        news
      );
    })
  );

  test.effect("answers a List ID it doesn't have with ListNotFound", () =>
    Effect.gen(function* missingList() {
      const { client, params } = yield* ownOrganization;

      const error = yield* client.lists
        .get({ params: { ...params, listId: NO_SUCH_LIST } })
        .pipe(Effect.flip);

      assert.strictEqual(error._tag, "ListNotFound");
    })
  );

  test.effect(
    "adds a Contact to a List as subscribed, and shows it on the List",
    () =>
      Effect.gen(function* addToList() {
        const { client, params } = yield* ownOrganization;

        const list = yield* client.lists.create({
          params,
          payload: { name: "Weekly news" },
        });

        const contact = yield* client.contacts.create({
          params,
          payload: { email: "ada@example.com" },
        });

        const listParams = { ...params, listId: list.id };

        const added = yield* client.lists.subscribe({
          params: { ...listParams, contactId: contact.id },
        });

        assert.match(added.id, SUBSCRIPTION_ID);
        assert.deepStrictEqual(added.contact, contact);
        assert.strictEqual(added.status, "subscribed");

        const page = yield* client.lists.subscriptions({
          params: listParams,
          query: {},
        });

        assert.deepStrictEqual(page.subscriptions, [added]);
        assert.isNull(page.next);
      })
  );

  test.effect(
    "never subscribes again a Contact who unsubscribed from the List",
    () =>
      Effect.gen(function* neverResubscribes() {
        const { client, params } = yield* ownOrganization;

        const list = yield* client.lists.create({
          params,
          payload: { name: "Weekly news" },
        });

        const contact = yield* client.contacts.create({
          params,
          payload: { email: "ada@example.com" },
        });

        const listParams = { ...params, listId: list.id };

        const subscribe = client.lists.subscribe({
          params: { ...listParams, contactId: contact.id },
        });

        const added = yield* subscribe;
        const sql = yield* SqlClient.SqlClient;

        yield* sql`update subscriptions set status = 'unsubscribed' where id = ${added.id}`;

        const again = yield* subscribe;

        const page = yield* client.lists.subscriptions({
          params: listParams,
          query: {},
        });

        assert.strictEqual(again.id, added.id);
        assert.strictEqual(again.status, "unsubscribed");
        assert.deepStrictEqual(page.subscriptions, [again]);
      })
  );

  test.effect("refuses to add a Contact or to a List it doesn't have", () =>
    Effect.gen(function* missingParts() {
      const { client, params } = yield* ownOrganization;

      const list = yield* client.lists.create({
        params,
        payload: { name: "Weekly news" },
      });

      const contact = yield* client.contacts.create({
        params,
        payload: { email: "ada@example.com" },
      });

      const noContact = yield* client.lists
        .subscribe({
          params: { ...params, contactId: NO_SUCH_CONTACT, listId: list.id },
        })
        .pipe(Effect.flip);

      const noList = yield* client.lists
        .subscribe({
          params: { ...params, contactId: contact.id, listId: NO_SUCH_LIST },
        })
        .pipe(Effect.flip);

      const noListToRead = yield* client.lists
        .subscriptions({
          params: { ...params, listId: NO_SUCH_LIST },
          query: {},
        })
        .pipe(Effect.flip);

      assert.strictEqual(noContact._tag, "ContactNotFound");
      assert.strictEqual(noList._tag, "ListNotFound");
      assert.strictEqual(noListToRead._tag, "ListNotFound");
    })
  );

  test.effect("pages through a List's Subscriptions newest first", () =>
    Effect.gen(function* pages() {
      const { client, params } = yield* ownOrganization;

      const list = yield* client.lists.create({
        params,
        payload: { name: "Weekly news" },
      });

      const other = yield* client.lists.create({
        params,
        payload: { name: "Offers" },
      });

      const listParams = { ...params, listId: list.id };

      const added = yield* Effect.forEach(
        Array.from({ length: PAGE_SIZE + 1 }, (_, index) => index),
        (index) =>
          Effect.gen(function* addOne() {
            const contact = yield* client.contacts.create({
              params,
              payload: { email: `person-${index}@example.com` },
            });

            yield* client.lists.subscribe({
              params: { ...params, contactId: contact.id, listId: other.id },
            });

            return yield* client.lists.subscribe({
              params: { ...listParams, contactId: contact.id },
            });
          })
      );

      const newestFirst = added.toSorted((a, b) => (a.id < b.id ? 1 : -1));

      const first = yield* client.lists.subscriptions({
        params: listParams,
        query: {},
      });

      assert.deepStrictEqual(
        first.subscriptions,
        newestFirst.slice(0, PAGE_SIZE)
      );
      assert.isNotNull(first.next);

      const second = yield* client.lists.subscriptions({
        params: listParams,
        query: { after: first.next ?? undefined },
      });

      assert.deepStrictEqual(
        second.subscriptions,
        newestFirst.slice(PAGE_SIZE)
      );
      assert.isNull(second.next);
    })
  );
});
