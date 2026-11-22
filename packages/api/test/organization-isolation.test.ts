import { assert, layer } from "@effect/vitest";
import { MailquiltApi } from "@repo/contract";
import { OrganizationIdSchema } from "@repo/domain";
import type { OrganizationId } from "@repo/domain";
import { Effect } from "effect";
import { HttpApi } from "effect/http-api";

import { signedInClient } from "./accounts.ts";
import { TestApp } from "./harness.ts";

type Client = Effect.Success<typeof signedInClient>;

// WARNING: every endpoint under /organizations/:organizationId needs a case here; the first test fails until it has one.
const TENANT_ENDPOINTS = {
  "GET /api/organizations/:organizationId": (
    client: Client,
    organizationId: OrganizationId
  ) => client.organizations.get({ params: { organizationId } }),
} satisfies Record<
  string,
  (
    client: Client,
    organizationId: OrganizationId
  ) => Effect.Effect<unknown, { readonly _tag: string }>
>;

const NO_SUCH_ORGANIZATION = OrganizationIdSchema.make(
  "org_00000000000000000000000000"
);

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

          const target = yield* owner.organizations.create({
            payload: { name: "Acme" },
          });

          yield* outsider.organizations.create({ payload: { name: "Bolt" } });

          for (const [endpoint, call] of Object.entries(TENANT_ENDPOINTS)) {
            const foreign = yield* call(outsider, target.id).pipe(Effect.flip);

            const missing = yield* call(outsider, NO_SUCH_ORGANIZATION).pipe(
              Effect.flip
            );

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
  }
);
