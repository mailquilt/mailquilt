import { assert, layer } from "@effect/vitest";
import { ContactIdSchema, ListIdSchema } from "@repo/domain";
import { Array as Arr, Effect } from "effect";
import { SqlClient } from "effect/sql";

import { ownOrganization } from "./accounts.ts";
import { TestApp } from "./harness.ts";

const LIST_ID = /^lst_[0-7][0-9a-hjkmnp-tv-z]{25}$/u;

const NO_SUCH_LIST = ListIdSchema.make("lst_00000000000000000000000000");

const NO_SUCH_CONTACT = ContactIdSchema.make("cnt_00000000000000000000000000");

const nonEmpty = <Item>(items: readonly Item[]) =>
  Arr.isReadonlyArrayNonEmpty(items)
    ? items
    : assert.fail("Expected at least one item");

const NO_SUBSCRIPTIONS = { pending: 0, subscribed: 0, unsubscribed: 0 };

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
      assert.deepStrictEqual({ ...news.subscriptions }, NO_SUBSCRIPTIONS);
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
    "adds Contacts to a List as subscribed, leaving existing Subscriptions as they are",
    () =>
      Effect.gen(function* addContacts() {
        const { client, params } = yield* ownOrganization;

        const news = yield* client.lists.create({
          params,
          payload: { name: "Weekly news" },
        });

        const listParams = { ...params, listId: news.id };

        const contacts = yield* Effect.forEach(
          ["ada", "grace", "alan", "hedy"],
          (name) =>
            client.contacts.create({
              params,
              payload: { email: `${name}@example.com` },
            })
        );

        const ids = contacts.map((contact) => contact.id);
        const sql = yield* SqlClient.SqlClient;

        yield* client.lists.addContacts({
          params: listParams,
          payload: { contactIds: nonEmpty(ids.slice(0, 3)) },
        });
        yield* sql`update subscriptions set status = 'pending' where contact_id = ${ids[1] ?? ""}`;
        yield* sql`update subscriptions set status = 'unsubscribed' where contact_id = ${ids[2] ?? ""}`;

        const result = yield* client.lists.addContacts({
          params: listParams,
          payload: { contactIds: nonEmpty(ids) },
        });

        assert.deepStrictEqual(
          { ...result },
          {
            added: 1,
            alreadySubscribed: 1,
            leftPending: 1,
            leftUnsubscribed: 1,
          }
        );
        assert.deepStrictEqual(
          {
            ...(yield* client.lists.get({ params: listParams })).subscriptions,
          },
          { pending: 1, subscribed: 2, unsubscribed: 1 }
        );
      })
  );

  test.effect("adds nobody when a Contact or the List doesn't exist", () =>
    Effect.gen(function* missingParts() {
      const { client, params } = yield* ownOrganization;

      const news = yield* client.lists.create({
        params,
        payload: { name: "Weekly news" },
      });

      const contact = yield* client.contacts.create({
        params,
        payload: { email: "ada@example.com" },
      });

      const noContact = yield* client.lists
        .addContacts({
          params: { ...params, listId: news.id },
          payload: { contactIds: [contact.id, NO_SUCH_CONTACT] },
        })
        .pipe(Effect.flip);

      const noList = yield* client.lists
        .addContacts({
          params: { ...params, listId: NO_SUCH_LIST },
          payload: { contactIds: [contact.id] },
        })
        .pipe(Effect.flip);

      assert.strictEqual(noContact._tag, "ContactNotFound");
      assert.strictEqual(noList._tag, "ListNotFound");
      assert.deepStrictEqual(
        {
          ...(yield* client.lists.get({
            params: { ...params, listId: news.id },
          })).subscriptions,
        },
        NO_SUBSCRIPTIONS
      );
    })
  );
});
