import { assert, layer } from "@effect/vitest";
import { Effect } from "effect";

import { ownOrganization } from "./accounts.ts";
import {
  newList,
  open,
  post,
  sendCampaign,
  statusOn,
  unsubscribePath,
} from "./campaign-emails.ts";
import type { Owner } from "./campaign-emails.ts";
import { APP_URL, TestApp } from "./harness.ts";

const PREFERENCES_LINK = /href="(?<url>[^"]+\/preferences\?token=[^"]+)"/u;

const preferencesPath = (email: { readonly html?: string }) =>
  (email.html?.match(PREFERENCES_LINK)?.groups?.url ?? "").slice(
    APP_URL.length
  );

const PREFERENCES_PATH = /href="(?<path>\/preferences\?token=[^"]+)"/u;

const change = (path: string, action: string, listId: string) =>
  post(
    path.replace("/preferences?", `/preferences/${action}?`),
    `list=${encodeURIComponent(listId)}`
  );

const adaOnTwoLists = Effect.gen(function* adaOnTwoLists() {
  const owner: Owner = yield* ownOrganization;
  const weekly = yield* newList(owner, "Weekly picks");
  const offers = yield* newList(owner, "Offers");
  const internal = yield* newList(owner, "Internal");

  yield* owner.client.contacts.create({
    params: owner.params,
    payload: { email: "ada@example.com", listIds: [weekly.id, offers.id] },
  });

  const [ada] = yield* sendCampaign(owner, weekly.id, ["ada@example.com"]);

  return { ada: ada ?? assert.fail(), internal, offers, owner, weekly };
});

layer(TestApp, { timeout: "2 minutes" })("Preferences", (test) => {
  test.effect(
    "links every Campaign email to its Contact's own preferences page, which lists only their Lists and changes nothing when opened",
    () =>
      Effect.gen(function* preferencesLink() {
        const { ada, offers, owner, weekly } = yield* adaOnTwoLists;
        const path = preferencesPath(ada);

        assert.match(path, /^\/preferences\?token=1\.[\w-]+\.[\w-]+$/u);
        assert.include(
          ada.text,
          `Manage your preferences:\n${APP_URL}${path}\n`
        );

        const opened = yield* open(path);

        assert.strictEqual(opened.status, 200);
        assert.include(opened.html, "Choose what you get");
        assert.include(opened.html, "ada@example.com");
        assert.include(opened.html, "Weekly picks");
        assert.include(opened.html, "Offers");
        assert.notInclude(opened.html, "Internal");
        assert.deepStrictEqual(
          [
            yield* statusOn(owner, weekly.id, "ada@example.com"),
            yield* statusOn(owner, offers.id, "ada@example.com"),
          ],
          ["subscribed", "subscribed"]
        );
      })
  );

  test.effect(
    "unsubscribes from one List and subscribes again, saying what changed",
    () =>
      Effect.gen(function* oneList() {
        const { ada, offers, owner, weekly } = yield* adaOnTwoLists;
        const path = preferencesPath(ada);

        const left = yield* change(path, "unsubscribe", offers.id);

        assert.strictEqual(left.status, 303);
        assert.deepStrictEqual(
          [
            yield* statusOn(owner, weekly.id, "ada@example.com"),
            yield* statusOn(owner, offers.id, "ada@example.com"),
          ],
          ["subscribed", "unsubscribed"]
        );
        assert.include(
          (yield* open(left.location ?? "")).html,
          "<title>You’re unsubscribed from Offers. Choose what you get</title>"
        );

        const back = yield* change(path, "subscribe", offers.id);

        assert.strictEqual(
          yield* statusOn(owner, offers.id, "ada@example.com"),
          "subscribed"
        );
        assert.include(
          (yield* open(back.location ?? "")).html,
          "You’re subscribed to Offers."
        );
      })
  );

  test.effect(
    "lifts an Opt-out for the one List chosen, leaving the others unsubscribed, so the next Campaign to them leaves the Contact out",
    () =>
      Effect.gen(function* liftOptOut() {
        const { ada, offers, owner, weekly } = yield* adaOnTwoLists;
        const path = preferencesPath(ada);

        const stopped = yield* post(
          path.replace("/preferences?", "/preferences/all?"),
          ""
        );

        assert.strictEqual(stopped.status, 303);
        assert.include(
          (yield* open(path)).html,
          "You’ve stopped all marketing email"
        );
        assert.deepStrictEqual(
          (yield* sendCampaign(owner, weekly.id, ["grace@example.com"])).map(
            (sent) => sent.to
          ),
          ["grace@example.com"]
        );

        yield* change(path, "subscribe", weekly.id);

        assert.deepStrictEqual(
          [
            yield* statusOn(owner, weekly.id, "ada@example.com"),
            yield* statusOn(owner, offers.id, "ada@example.com"),
          ],
          ["subscribed", "unsubscribed"]
        );
        assert.deepStrictEqual(
          (yield* sendCampaign(owner, weekly.id, []))
            .map((sent) => sent.to)
            .toSorted(),
          ["ada@example.com", "grace@example.com"]
        );

        const toOffers = yield* sendCampaign(owner, offers.id, [
          "hedy@example.com",
        ]);

        assert.deepStrictEqual(
          toOffers.map((sent) => sent.to),
          ["hedy@example.com"]
        );
      })
  );

  test.effect(
    "never subscribes the Contact to a List they aren't on, in their Organization or another, nor lifts their Opt-out for one",
    () =>
      Effect.gen(function* notTheirList() {
        const { ada, internal, owner } = yield* adaOnTwoLists;
        const elsewhere = yield* newList(yield* ownOrganization, "Elsewhere");
        const path = preferencesPath(ada);

        yield* post(path.replace("/preferences?", "/preferences/all?"), "");
        yield* change(path, "subscribe", internal.id);
        yield* change(path, "subscribe", elsewhere.id);

        const page = (yield* open(path)).html;

        assert.isUndefined(
          yield* statusOn(owner, internal.id, "ada@example.com")
        );
        assert.notInclude(page, "Internal");
        assert.include(page, "You’ve stopped all marketing email");
      })
  );

  test.effect("refuses a link that was changed, and changes nothing", () =>
    Effect.gen(function* changedLink() {
      const { ada, offers, owner } = yield* adaOnTwoLists;
      const changed = `${preferencesPath(ada)}x`;

      const opened = yield* open(changed);
      const posted = yield* change(changed, "unsubscribe", offers.id);

      assert.strictEqual(opened.status, 404);
      assert.include(opened.html, "This preferences link doesn’t work");
      assert.strictEqual(posted.status, 404);
      assert.strictEqual(
        yield* statusOn(owner, offers.id, "ada@example.com"),
        "subscribed"
      );
    })
  );

  test.effect(
    "leads from the unsubscribe page to the Contact's preferences",
    () =>
      Effect.gen(function* fromUnsubscribe() {
        const { ada } = yield* adaOnTwoLists;
        const unsubscribe = unsubscribePath(ada);

        yield* post(unsubscribe, "from=page");

        const page = yield* open(unsubscribe);
        const link = page.html.match(PREFERENCES_PATH);

        assert.include(
          (yield* open((link?.groups?.path ?? "").replaceAll("&amp;", "&")))
            .html,
          "Choose what you get"
        );
      })
  );
});
