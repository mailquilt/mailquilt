import { assert, layer } from "@effect/vitest";
import { MailquiltApi } from "@repo/contract";
import { OrganizationIdSchema } from "@repo/domain";
import type { ContactId, ListId, OrganizationId } from "@repo/domain";
import { Effect } from "effect";
import { HttpApi } from "effect/http-api";

import { signedInClient } from "./accounts.ts";
import { TestApp } from "./harness.ts";

type Client = Effect.Success<typeof signedInClient>;

interface Target {
  readonly organizationId: OrganizationId;
  readonly listId: ListId;
  readonly contactId: ContactId;
}

type TenantCall = (
  client: Client,
  target: Target
) => Effect.Effect<unknown, { readonly _tag: string }>;

// WARNING: every endpoint under /organizations/:organizationId needs a case here; the first test fails until it has one.
const TENANT_ENDPOINTS = {
  "GET /api/organizations/:organizationId": (
    client: Client,
    { organizationId }: Target
  ) => client.organizations.get({ params: { organizationId } }),
  "GET /api/organizations/:organizationId/contacts": (
    client: Client,
    { listId, organizationId }: Target
  ) =>
    client.contacts.list({
      params: { organizationId },
      query: { list: listId },
    }),
  "GET /api/organizations/:organizationId/lists": (
    client: Client,
    { organizationId }: Target
  ) => client.lists.list({ params: { organizationId } }),
  "GET /api/organizations/:organizationId/lists/:listId": (
    client: Client,
    { listId, organizationId }: Target
  ) => client.lists.get({ params: { listId, organizationId } }),
  "POST /api/organizations/:organizationId/contacts": (
    client: Client,
    { listId, organizationId }: Target
  ) =>
    client.contacts.create({
      params: { organizationId },
      payload: { email: "intruder@example.com", listIds: [listId] },
    }),
  "POST /api/organizations/:organizationId/lists": (
    client: Client,
    { organizationId }: Target
  ) =>
    client.lists.create({
      params: { organizationId },
      payload: { name: "Intruder" },
    }),
  "POST /api/organizations/:organizationId/lists/:listId/subscriptions": (
    client: Client,
    { contactId, listId, organizationId }: Target
  ) =>
    client.lists.addContacts({
      params: { listId, organizationId },
      payload: { contactIds: [contactId] },
    }),
} satisfies Record<string, TenantCall>;

const NO_SUCH_ORGANIZATION = OrganizationIdSchema.make(
  "org_00000000000000000000000000"
);

const ownedData = (owner: Client) =>
  Effect.gen(function* organizationWithData() {
    const organization = yield* owner.organizations.create({
      payload: { name: "Acme" },
    });

    const params = { organizationId: organization.id };

    const list = yield* owner.lists.create({
      params,
      payload: { name: "Weekly news" },
    });

    const contact = yield* owner.contacts.create({
      params,
      payload: { email: "ada@example.com", listIds: [list.id] },
    });

    return {
      contactId: contact.id,
      listId: list.id,
      organizationId: organization.id,
    } satisfies Target;
  });

const tenantEndpointsInContract = () => {
  const endpoints: string[] = [];

  HttpApi.reflect(MailquiltApi, {
    onEndpoint: ({ endpoint }) => {
      if (endpoint.path.includes(":organizationId")) {
        endpoints.push(`${endpoint.method} ${endpoint.path}`);
      }
    },
    onGroup: () => null,
  });

  return endpoints.toSorted();
};

layer(TestApp, { timeout: "2 minutes" })(
  "isolation between Organizations",
  (test) => {
    test("has a case for every endpoint for one Organization's data", () => {
      assert.deepStrictEqual(
        Object.keys(TENANT_ENDPOINTS).toSorted(),
        tenantEndpointsInContract()
      );
    });

    test.effect(
      "answers someone from another Organization as if it didn't exist",
      () =>
        Effect.gen(function* otherOrganization() {
          const owner = yield* signedInClient;
          const outsider = yield* signedInClient;

          const target = yield* ownedData(owner);

          yield* outsider.organizations.create({ payload: { name: "Bolt" } });

          const calls: [string, TenantCall][] =
            Object.entries(TENANT_ENDPOINTS);

          for (const [endpoint, call] of calls) {
            const foreign = yield* call(outsider, target).pipe(Effect.flip);

            const missing = yield* call(outsider, {
              ...target,
              organizationId: NO_SUCH_ORGANIZATION,
            }).pipe(Effect.flip);

            assert.strictEqual(foreign._tag, "OrganizationNotFound", endpoint);
            assert.strictEqual(missing._tag, "OrganizationNotFound", endpoint);
          }
        })
    );

    test.effect("never lists another person's Organizations", () =>
      Effect.gen(function* otherPeoplesOrganizations() {
        const owner = yield* signedInClient;
        const outsider = yield* signedInClient;

        yield* owner.organizations.create({ payload: { name: "Acme" } });

        const own = yield* outsider.organizations.create({
          payload: { name: "Bolt" },
        });

        assert.deepStrictEqual(yield* outsider.organizations.list(), [own]);
      })
    );

    test.effect(
      "never reaches another Organization's Lists or Contacts from its own",
      () =>
        Effect.gen(function* throughOwnOrganization() {
          const owner = yield* signedInClient;
          const outsider = yield* signedInClient;
          const target = yield* ownedData(owner);
          const own = yield* ownedData(outsider);
          const params = { organizationId: own.organizationId };

          const foreignList = yield* outsider.lists
            .get({ params: { ...params, listId: target.listId } })
            .pipe(Effect.flip);

          const filteredByForeignList = yield* outsider.contacts
            .list({ params, query: { list: target.listId } })
            .pipe(Effect.flip);

          const createdOnForeignList = yield* outsider.contacts
            .create({
              params,
              payload: {
                email: "grace@example.com",
                listIds: [target.listId],
              },
            })
            .pipe(Effect.flip);

          const foreignContact = yield* outsider.lists
            .addContacts({
              params: { ...params, listId: own.listId },
              payload: { contactIds: [target.contactId] },
            })
            .pipe(Effect.flip);

          const ontoForeignList = yield* outsider.lists
            .addContacts({
              params: { ...params, listId: target.listId },
              payload: { contactIds: [own.contactId] },
            })
            .pipe(Effect.flip);

          assert.strictEqual(foreignList._tag, "ListNotFound");
          assert.strictEqual(filteredByForeignList._tag, "ListNotFound");
          assert.strictEqual(createdOnForeignList._tag, "ListNotFound");
          assert.strictEqual(foreignContact._tag, "ContactNotFound");
          assert.strictEqual(ontoForeignList._tag, "ListNotFound");

          const contacts = yield* outsider.contacts.list({ params, query: {} });
          const lists = yield* outsider.lists.list({ params });

          assert.deepStrictEqual(
            contacts.contacts.map((contact) => contact.id),
            [own.contactId]
          );
          assert.strictEqual(contacts.total, 1);
          assert.deepStrictEqual(
            contacts.contacts.flatMap((contact) =>
              contact.subscriptions.map((subscription) => subscription.listId)
            ),
            [own.listId]
          );
          assert.deepStrictEqual(
            lists.map((list) => [list.id, list.subscriptions.subscribed]),
            [[own.listId, 1]]
          );
        })
    );
  }
);
