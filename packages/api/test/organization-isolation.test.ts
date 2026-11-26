import { assert, layer } from "@effect/vitest";
import { MailquiltApi } from "@repo/contract";
import { SignedTokens, signedTokensLayer } from "@repo/core";
import { OrganizationIdSchema } from "@repo/domain";
import type {
  CampaignId,
  ContactId,
  ListId,
  OrganizationId,
  ProviderConnectionId,
} from "@repo/domain";
import { Effect, Redacted } from "effect";
import { HttpApi } from "effect/http-api";

import { signedInClient } from "./accounts.ts";
import { APP_URL, AppFetch, TEST_ENCRYPTION_KEYS, TestApp } from "./harness.ts";

type Client = Effect.Success<typeof signedInClient>;

interface Target {
  readonly organizationId: OrganizationId;
  readonly campaignId: CampaignId;
  readonly listId: ListId;
  readonly contactId: ContactId;
  readonly providerConnectionId: ProviderConnectionId;
}

type TenantCall = (
  client: Client,
  target: Target
) => Effect.Effect<unknown, { readonly _tag: string }>;

const intruderCampaign = {
  from: { email: "intruder@example.com" },
  html: "<p>Hello</p>",
  subject: "Intruder",
} as const;

const intruderConnection = {
  credentials: {
    password: Redacted.make("password"),
    username: Redacted.make("intruder"),
  },
  from: { email: "intruder@example.com" },
  name: "Intruder",
  smtp: { host: "smtp.example.com", port: 587, security: "starttls" },
} as const;

// WARNING: every endpoint under /organizations/:organizationId needs a case here; the first test fails until it has one.
const TENANT_ENDPOINTS = {
  "GET /api/organizations/:organizationId/campaigns": (
    client: Client,
    { organizationId }: Target
  ) => client.campaigns.list({ params: { organizationId }, query: {} }),
  "POST /api/organizations/:organizationId/campaigns": (
    client: Client,
    { listId, organizationId, providerConnectionId }: Target
  ) =>
    client.campaigns.create({
      params: { organizationId },
      payload: { ...intruderCampaign, listId, providerConnectionId },
    }),
  "GET /api/organizations/:organizationId/campaigns/:campaignId": (
    client: Client,
    { campaignId, organizationId }: Target
  ) => client.campaigns.get({ params: { campaignId, organizationId } }),
  "PUT /api/organizations/:organizationId/campaigns/:campaignId": (
    client: Client,
    { campaignId, listId, organizationId, providerConnectionId }: Target
  ) =>
    client.campaigns.update({
      params: { campaignId, organizationId },
      payload: { ...intruderCampaign, listId, providerConnectionId },
    }),
  "POST /api/organizations/:organizationId/campaigns/:campaignId/send": (
    client: Client,
    { campaignId, organizationId }: Target
  ) => client.campaigns.send({ params: { campaignId, organizationId } }),
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
  "GET /api/organizations/:organizationId/provider-connections": (
    client: Client,
    { organizationId }: Target
  ) => client.providerConnections.list({ params: { organizationId } }),
  "POST /api/organizations/:organizationId/provider-connections": (
    client: Client,
    { organizationId }: Target
  ) =>
    client.providerConnections.create({
      params: { organizationId },
      payload: intruderConnection,
    }),
  "PUT /api/organizations/:organizationId/provider-connections/:providerConnectionId":
    (client: Client, { organizationId, providerConnectionId }: Target) =>
      client.providerConnections.update({
        params: { organizationId, providerConnectionId },
        payload: { ...intruderConnection, credentials: null },
      }),
  "DELETE /api/organizations/:organizationId/provider-connections/:providerConnectionId":
    (client: Client, { organizationId, providerConnectionId }: Target) =>
      client.providerConnections.delete({
        params: { organizationId, providerConnectionId },
      }),
  "POST /api/organizations/:organizationId/provider-connections/:providerConnectionId/test-emails":
    (client: Client, { organizationId, providerConnectionId }: Target) =>
      client.providerConnections.sendTestEmail({
        params: { organizationId, providerConnectionId },
        payload: { to: "intruder@example.com" },
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

    const connection = yield* owner.providerConnections.create({
      params,
      payload: {
        from: { email: "news@acme.example" },
        name: "Postmark",
        smtp: { host: "smtp.example.com", port: 587, security: "starttls" },
      },
    });

    const campaign = yield* owner.campaigns.create({
      params,
      payload: {
        from: { email: "news@acme.example" },
        html: "<p>This week at Acme</p>",
        listId: list.id,
        providerConnectionId: connection.id,
        subject: "This week at Acme",
      },
    });

    return {
      campaignId: campaign.id,
      contactId: contact.id,
      listId: list.id,
      organizationId: organization.id,
      providerConnectionId: connection.id,
    } satisfies Target;
  });

const unsubscribeToken = (ids: readonly string[]) =>
  Effect.gen(function* signUnsubscribeToken() {
    const tokens = yield* SignedTokens;

    return yield* tokens.sign("unsubscribe", ids.join("."));
  }).pipe(Effect.provide(signedTokensLayer(TEST_ENCRYPTION_KEYS)));

const unsubscribeRequests = (token: string) =>
  Effect.gen(function* everyUnsubscribeRequest() {
    const fetch = yield* AppFetch;
    const query = `?token=${encodeURIComponent(token)}`;

    const oneClick = {
      body: "List-Unsubscribe=One-Click",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      method: "POST",
    };

    const responses = yield* Effect.promise(() =>
      Promise.all([
        fetch(`${APP_URL}/unsubscribe${query}`),
        fetch(`${APP_URL}/unsubscribe${query}`, oneClick),
        fetch(`${APP_URL}/unsubscribe/all${query}`, oneClick),
      ])
    );

    return responses.map((response) => response.status);
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
      "never reaches another Organization's Provider Connections from its own",
      () =>
        Effect.gen(function* foreignConnection() {
          const owner = yield* signedInClient;
          const outsider = yield* signedInClient;
          const target = yield* ownedData(owner);
          const own = yield* ownedData(outsider);
          const params = { organizationId: own.organizationId };

          const testEmail = yield* outsider.providerConnections
            .sendTestEmail({
              params: {
                ...params,
                providerConnectionId: target.providerConnectionId,
              },
              payload: { to: "intruder@example.com" },
            })
            .pipe(Effect.flip);

          const foreign = {
            ...params,
            providerConnectionId: target.providerConnectionId,
          };

          const edit = yield* outsider.providerConnections
            .update({
              params: foreign,
              payload: { ...intruderConnection, credentials: null },
            })
            .pipe(Effect.flip);

          const removal = yield* outsider.providerConnections
            .delete({ params: foreign })
            .pipe(Effect.flip);

          const connections = yield* outsider.providerConnections.list({
            params,
          });

          assert.strictEqual(testEmail._tag, "ProviderConnectionNotFound");
          assert.strictEqual(edit._tag, "ProviderConnectionNotFound");
          assert.strictEqual(removal._tag, "ProviderConnectionNotFound");
          assert.lengthOf(
            yield* owner.providerConnections.list({
              params: { organizationId: target.organizationId },
            }),
            1
          );
          assert.deepStrictEqual(
            connections.map((connection) => connection.id),
            [own.providerConnectionId]
          );
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

    test.effect(
      "never unsubscribes or opts out a Contact through a link that mixes in another Organization's IDs",
      () =>
        Effect.gen(function* foreignUnsubscribe() {
          const owner = yield* signedInClient;
          const outsider = yield* signedInClient;
          const target = yield* ownedData(owner);
          const own = yield* ownedData(outsider);

          const mixed = [
            [own.organizationId, target.campaignId, target.contactId],
            [own.organizationId, own.campaignId, target.contactId],
            [own.organizationId, target.campaignId, own.contactId],
            [target.organizationId, own.campaignId, target.contactId],
          ];

          for (const ids of mixed) {
            const token = yield* unsubscribeToken(ids);

            assert.deepStrictEqual(
              yield* unsubscribeRequests(token),
              [404, 404, 404],
              ids.join(".")
            );
          }

          const fetch = yield* AppFetch;

          for (const data of [target, own]) {
            const token = yield* unsubscribeToken([
              data.organizationId,
              data.campaignId,
              data.contactId,
            ]);

            const response = yield* Effect.promise(() =>
              fetch(`${APP_URL}/unsubscribe?token=${encodeURIComponent(token)}`)
            );

            const page = yield* Effect.promise(() => response.text());

            assert.include(page, "Unsubscribe from Weekly news?");
          }
        })
    );

    test.effect(
      "never reaches another Organization's Campaigns, Lists or Provider Connections from its own",
      () =>
        Effect.gen(function* foreignCampaigns() {
          const owner = yield* signedInClient;
          const outsider = yield* signedInClient;
          const target = yield* ownedData(owner);
          const own = yield* ownedData(outsider);
          const params = { organizationId: own.organizationId };
          const foreign = { ...params, campaignId: target.campaignId };

          const draft = {
            ...intruderCampaign,
            listId: own.listId,
            providerConnectionId: own.providerConnectionId,
          };

          const toForeignList = yield* outsider.campaigns
            .create({ params, payload: { ...draft, listId: target.listId } })
            .pipe(Effect.flip);

          const throughForeignConnection = yield* outsider.campaigns
            .create({
              params,
              payload: {
                ...draft,
                providerConnectionId: target.providerConnectionId,
              },
            })
            .pipe(Effect.flip);

          const read = yield* outsider.campaigns
            .get({ params: foreign })
            .pipe(Effect.flip);

          const edit = yield* outsider.campaigns
            .update({ params: foreign, payload: draft })
            .pipe(Effect.flip);

          const sent = yield* outsider.campaigns
            .send({ params: foreign })
            .pipe(Effect.flip);

          assert.strictEqual(toForeignList._tag, "ListNotFound");
          assert.strictEqual(
            throughForeignConnection._tag,
            "ProviderConnectionNotFound"
          );
          assert.strictEqual(read._tag, "CampaignNotFound");
          assert.strictEqual(edit._tag, "CampaignNotFound");
          assert.strictEqual(sent._tag, "CampaignNotFound");
          assert.deepStrictEqual(
            (yield* outsider.campaigns.list({
              params,
              query: {},
            })).campaigns.map((campaign) => campaign.id),
            [own.campaignId]
          );
          assert.strictEqual(
            (yield* owner.campaigns.get({
              params: {
                campaignId: target.campaignId,
                organizationId: target.organizationId,
              },
            })).status,
            "draft"
          );
        })
    );
  }
);
