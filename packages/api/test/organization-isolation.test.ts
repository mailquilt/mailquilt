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
    { organizationId }: Target
  ) => client.contacts.list({ params: { organizationId }, query: {} }),
  "GET /api/organizations/:organizationId/lists": (
    client: Client,
    { organizationId }: Target
  ) => client.lists.list({ params: { organizationId } }),
  "GET /api/organizations/:organizationId/lists/:listId": (
    client: Client,
    { listId, organizationId }: Target
  ) => client.lists.get({ params: { listId, organizationId } }),
  "GET /api/organizations/:organizationId/lists/:listId/subscriptions": (
    client: Client,
    { listId, organizationId }: Target
  ) =>
    client.lists.subscriptions({
      params: { listId, organizationId },
      query: {},
    }),
  "POST /api/organizations/:organizationId/contacts": (
    client: Client,
    { organizationId }: Target
  ) =>
    client.contacts.create({
      params: { organizationId },
      payload: { email: "intruder@example.com" },
    }),
  "POST /api/organizations/:organizationId/lists": (
    client: Client,
    { organizationId }: Target
  ) =>
    client.lists.create({
      params: { organizationId },
      payload: { name: "Intruder" },
    }),
  "PUT /api/organizations/:organizationId/lists/:listId/subscriptions/:contactId":
    (client: Client, target: Target) =>
      client.lists.subscribe({ params: target }),
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
      payload: { email: "ada@example.com" },
    });

    yield* owner.lists.subscribe({
      params: { ...params, contactId: contact.id, listId: list.id },
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

          const foreignSubscriptions = yield* outsider.lists
            .subscriptions({
              params: { ...params, listId: target.listId },
              query: {},
            })
            .pipe(Effect.flip);

          const foreignContact = yield* outsider.lists
            .subscribe({ params: { ...own, contactId: target.contactId } })
            .pipe(Effect.flip);

          const ontoForeignList = yield* outsider.lists
            .subscribe({ params: { ...own, listId: target.listId } })
            .pipe(Effect.flip);

          assert.strictEqual(foreignList._tag, "ListNotFound");
          assert.strictEqual(foreignSubscriptions._tag, "ListNotFound");
          assert.strictEqual(foreignContact._tag, "ContactNotFound");
          assert.strictEqual(ontoForeignList._tag, "ListNotFound");

          const contacts = yield* outsider.contacts.list({ params, query: {} });
          const lists = yield* outsider.lists.list({ params });

          const subscriptions = yield* outsider.lists.subscriptions({
            params: { ...params, listId: own.listId },
            query: {},
          });

          assert.deepStrictEqual(
            contacts.contacts.map((contact) => contact.id),
            [own.contactId]
          );
          assert.deepStrictEqual(
            lists.map((list) => list.id),
            [own.listId]
          );
          assert.deepStrictEqual(
            subscriptions.subscriptions.map(
              (subscription) => subscription.contact.id
            ),
            [own.contactId]
          );
        })
    );
  }
);
