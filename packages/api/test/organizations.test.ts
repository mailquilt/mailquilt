import { assert, layer } from "@effect/vitest";
import { Organization } from "@repo/domain";
import { Effect, Schema } from "effect";

import {
  clientWithCookie,
  send,
  signedInClient,
  signedInPerson,
} from "./accounts.ts";
import { ApiClient, TestApp } from "./harness.ts";

const ORGANIZATION_ID = /^org_[0-7][0-9a-hjkmnp-tv-z]{25}$/u;

layer(TestApp, { timeout: "2 minutes" })("Organizations", (test) => {
  test.effect("makes the person who creates an Organization its owner", () =>
    Effect.gen(function* createAsOwner() {
      const client = yield* signedInClient;

      const created = yield* client.organizations.create({
        payload: { name: "Acme Newsletter" },
      });

      assert.match(created.id, ORGANIZATION_ID);
      assert.strictEqual(created.name, "Acme Newsletter");
      assert.strictEqual(created.role, "owner");

      const fetched = yield* client.organizations.get({
        params: { organizationId: created.id },
      });

      assert.deepStrictEqual(fetched, created);
    })
  );

  test.effect("lists every Organization the person belongs to", () =>
    Effect.gen(function* listOwn() {
      const client = yield* signedInClient;

      assert.deepStrictEqual(yield* client.organizations.list(), []);

      const first = yield* client.organizations.create({
        payload: { name: "Acme" },
      });

      const second = yield* client.organizations.create({
        payload: { name: "Bolt" },
      });

      assert.deepStrictEqual(yield* client.organizations.list(), [
        first,
        second,
      ]);
    })
  );

  test.effect("trims spaces around an Organization name", () =>
    Effect.gen(function* trimmedName() {
      const cookie = yield* signedInPerson;

      const response = yield* send("POST", "/api/organizations", {
        body: { name: "  Acme Newsletter  " },
        headers: { cookie },
      });

      const created = yield* Effect.promise(() => response.json()).pipe(
        Effect.flatMap(Schema.decodeUnknownEffect(Organization))
      );

      assert.strictEqual(response.status, 201);
      assert.strictEqual(created.name, "Acme Newsletter");
    })
  );

  test.effect("refuses an Organization name that is only spaces", () =>
    Effect.gen(function* blankName() {
      const cookie = yield* signedInPerson;

      const response = yield* send("POST", "/api/organizations", {
        body: { name: "   " },
        headers: { cookie },
      });

      assert.strictEqual(response.status, 400);
    })
  );

  test.effect(
    "saves the Organization's postal address, trimmed, and shows it to its members",
    () =>
      Effect.gen(function* savedAddress() {
        const cookie = yield* signedInPerson;
        const client = yield* clientWithCookie(cookie);

        const created = yield* client.organizations.create({
          payload: { name: "Acme" },
        });

        assert.isNull(created.postalAddress);

        const response = yield* send(
          "PUT",
          `/api/organizations/${created.id}/postal-address`,
          {
            body: { postalAddress: "  14 Mill Lane\nBristol BS1 4XE  " },
            headers: { cookie },
          }
        );

        const saved = yield* Effect.promise(() => response.json()).pipe(
          Effect.flatMap(Schema.decodeUnknownEffect(Organization))
        );

        assert.strictEqual(response.status, 200);
        assert.strictEqual(
          saved.postalAddress,
          "14 Mill Lane\nBristol BS1 4XE"
        );
        assert.deepStrictEqual(
          yield* client.organizations.get({
            params: { organizationId: created.id },
          }),
          saved
        );
        assert.deepStrictEqual(yield* client.organizations.list(), [saved]);
      })
  );

  test.effect("refuses a postal address that is only spaces", () =>
    Effect.gen(function* blankAddress() {
      const cookie = yield* signedInPerson;
      const client = yield* clientWithCookie(cookie);

      const created = yield* client.organizations.create({
        payload: { name: "Acme" },
      });

      const response = yield* send(
        "PUT",
        `/api/organizations/${created.id}/postal-address`,
        { body: { postalAddress: " \n " }, headers: { cookie } }
      );

      assert.strictEqual(response.status, 400);
    })
  );

  test.effect(
    "refuses to create an Organization from another origin's page",
    () =>
      Effect.gen(function* crossOrigin() {
        const cookie = yield* signedInPerson;

        const response = yield* send("POST", "/api/organizations", {
          body: { name: "Acme" },
          headers: { cookie, origin: "https://attacker.example" },
        });

        assert.strictEqual(response.status, 401);
      })
  );

  test.effect(
    "refuses a body larger than 64 KiB without reading it, before sign-in",
    () =>
      Effect.gen(function* oversizedBody() {
        const response = yield* send("POST", "/api/organizations", {
          body: { name: "x".repeat(65 * 1024) },
        });

        assert.strictEqual(response.status, 413);
      })
  );

  test.effect("asks for sign-in without a session", () =>
    Effect.gen(function* signedOut() {
      const client = yield* ApiClient;

      const error = yield* client.organizations.list().pipe(Effect.flip);

      assert.strictEqual(error._tag, "SignInRequired");
    })
  );
});
