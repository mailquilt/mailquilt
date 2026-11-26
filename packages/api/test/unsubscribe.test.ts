import { assert, layer } from "@effect/vitest";
import { SmtpOutbox } from "@repo/core/testing";
import { Effect } from "effect";

import { ownOrganization } from "./accounts.ts";
import {
  newList,
  open,
  post,
  postMultipart,
  sendCampaign,
  sentWith,
  startCampaign,
  statusOn,
  unsubscribePath,
} from "./campaign-emails.ts";
import { APP_URL, AppFetch, QueueWorker, TestApp } from "./harness.ts";

const ONE_CLICK = "List-Unsubscribe=One-Click";

const FROM_PAGE = "from=page";

layer(TestApp, { timeout: "2 minutes" })("Unsubscribe", (test) => {
  test.effect(
    "gives each Campaign email its own one-click unsubscribe headers and link",
    () =>
      Effect.gen(function* headersAndLink() {
        const owner = yield* ownOrganization;
        const list = yield* newList(owner, "Weekly picks");

        const [ada, grace] = yield* sendCampaign(owner, list.id, [
          "ada@example.com",
          "grace@example.com",
        ]);

        const adaPath = unsubscribePath(ada ?? {});

        assert.match(adaPath, /^\/unsubscribe\?token=1\.[\w-]+\.[\w-]+$/u);
        assert.notStrictEqual(adaPath, unsubscribePath(grace ?? {}));
        assert.strictEqual(
          ada?.headers?.["List-Unsubscribe-Post"],
          "List-Unsubscribe=One-Click"
        );
        assert.include(ada?.html, `href="${APP_URL}${adaPath}"`);
        assert.include(
          ada?.text,
          `Don’t want these emails? Unsubscribe:\n${APP_URL}${adaPath}\n`
        );
      })
  );

  test.effect(
    "unsubscribes with a mail app's one-click post, with no page and no session",
    () =>
      Effect.gen(function* oneClick() {
        const owner = yield* ownOrganization;
        const list = yield* newList(owner, "Weekly picks");

        const [ada, grace] = yield* sendCampaign(owner, list.id, [
          "ada@example.com",
          "grace@example.com",
        ]);

        const urlEncoded = yield* post(unsubscribePath(ada ?? {}), ONE_CLICK);
        const multipart = yield* postMultipart(unsubscribePath(grace ?? {}));

        assert.deepStrictEqual(
          [urlEncoded.status, multipart.status],
          [200, 200]
        );
        assert.deepStrictEqual(
          [
            yield* statusOn(owner, list.id, "ada@example.com"),
            yield* statusOn(owner, list.id, "grace@example.com"),
          ],
          ["unsubscribed", "unsubscribed"]
        );
      })
  );

  test.effect(
    "asks before unsubscribing, so opening the link changes nothing",
    () =>
      Effect.gen(function* confirmFirst() {
        const owner = yield* ownOrganization;
        const list = yield* newList(owner, "Weekly picks");
        const [ada] = yield* sendCampaign(owner, list.id, ["ada@example.com"]);
        const path = unsubscribePath(ada ?? {});

        const opened = yield* open(path);

        assert.strictEqual(opened.status, 200);
        assert.include(opened.html, "Unsubscribe from Weekly picks?");
        assert.include(opened.html, "ada@example.com");
        assert.strictEqual(
          yield* statusOn(owner, list.id, "ada@example.com"),
          "subscribed"
        );

        const confirmed = yield* post(path, FROM_PAGE);

        assert.strictEqual(confirmed.status, 303);
        assert.strictEqual(confirmed.location, path);
        assert.strictEqual(
          yield* statusOn(owner, list.id, "ada@example.com"),
          "unsubscribed"
        );
        assert.include((yield* open(path)).html, "You’re unsubscribed");
      })
  );

  test.effect(
    "names and unsubscribes from only the Campaign's Lists the Contact is on, never its other Lists",
    () =>
      Effect.gen(function* onlyTheirLists() {
        const owner = yield* ownOrganization;
        const list = yield* newList(owner, "Weekly picks");
        const vip = yield* newList(owner, "Lapsed VIPs");
        const club = yield* newList(owner, "Roasting club");

        yield* owner.client.contacts.create({
          params: owner.params,
          payload: { email: "grace@example.com", listIds: [vip.id, club.id] },
        });

        const sent = yield* sendCampaign(
          owner,
          list.id,
          ["ada@example.com"],
          [vip.id]
        );

        const pathTo = (email: string) =>
          unsubscribePath(sent.find((one) => one.to === email) ?? {});

        const adaPage = yield* open(pathTo("ada@example.com"));
        const gracePage = yield* open(pathTo("grace@example.com"));

        yield* post(pathTo("grace@example.com"), ONE_CLICK);

        assert.include(adaPage.html, "Unsubscribe from Weekly picks?");
        assert.notInclude(adaPage.html, "Lapsed VIPs");
        assert.include(gracePage.html, "Unsubscribe from Lapsed VIPs?");
        assert.notInclude(gracePage.html, "Weekly picks");
        assert.notInclude(gracePage.html, "Roasting club");
        assert.deepStrictEqual(
          [
            yield* statusOn(owner, vip.id, "grace@example.com"),
            yield* statusOn(owner, club.id, "grace@example.com"),
          ],
          ["unsubscribed", "subscribed"]
        );
        assert.strictEqual(
          yield* statusOn(owner, list.id, "ada@example.com"),
          "subscribed"
        );
      })
  );

  test.effect("refuses a link that was changed, and changes nothing", () =>
    Effect.gen(function* changedLink() {
      const owner = yield* ownOrganization;
      const list = yield* newList(owner, "Weekly picks");
      const [ada] = yield* sendCampaign(owner, list.id, ["ada@example.com"]);
      const path = unsubscribePath(ada ?? {});
      const changed = `${path.slice(0, -2)}${path.endsWith("AA") ? "BB" : "AA"}`;

      const opened = yield* open(changed);
      const posted = yield* post(changed, ONE_CLICK);

      assert.strictEqual(opened.status, 404);
      assert.include(opened.html, "This unsubscribe link doesn’t work");
      assert.strictEqual(posted.status, 404);
      assert.strictEqual(
        yield* statusOn(owner, list.id, "ada@example.com"),
        "subscribed"
      );
    })
  );

  test.effect(
    "stops all marketing email with an Opt-out, which keeps the Contact out of the next Campaign on any List",
    () =>
      Effect.gen(function* optOut() {
        const owner = yield* ownOrganization;
        const weekly = yield* newList(owner, "Weekly picks");
        const offers = yield* newList(owner, "Offers");

        const [ada] = yield* sendCampaign(owner, weekly.id, [
          "ada@example.com",
        ]);

        const path = unsubscribePath(ada ?? {});

        yield* owner.client.contacts
          .create({
            params: owner.params,
            payload: { email: "grace@example.com", listIds: [offers.id] },
          })
          .pipe(Effect.ignore);

        const ids = (yield* owner.client.contacts.list({
          params: owner.params,
          query: {},
        })).contacts;

        const adaContact = ids.find(
          (contact) => contact.email === "ada@example.com"
        );

        yield* owner.client.lists.addContacts({
          params: { ...owner.params, listId: offers.id },
          payload: { contactIds: [adaContact?.id ?? assert.fail()] },
        });

        const stopped = yield* post(
          path.replace("/unsubscribe?", "/unsubscribe/all?"),
          FROM_PAGE
        );

        assert.strictEqual(stopped.status, 303);
        assert.strictEqual(stopped.location, path);
        assert.include(
          (yield* open(path)).html,
          "You won’t get marketing email from"
        );

        const next = yield* sendCampaign(owner, offers.id, []);

        assert.deepStrictEqual(
          next.map((email) => email.to),
          ["grace@example.com"]
        );
      })
  );

  test.effect(
    "leaves out a Contact who stops marketing email while a Campaign is still sending to them",
    () =>
      Effect.gen(function* optOutMidSend() {
        const owner = yield* ownOrganization;
        const list = yield* newList(owner, "Weekly picks");

        const [ada] = yield* sendCampaign(owner, list.id, ["ada@example.com"]);

        const next = yield* startCampaign(owner, list.id, [
          "grace@example.com",
        ]);

        yield* post(
          unsubscribePath(ada ?? {}).replace(
            "/unsubscribe?",
            "/unsubscribe/all?"
          ),
          FROM_PAGE
        );

        yield* (yield* QueueWorker).deliverAll;

        const sent = yield* owner.client.campaigns.get({
          params: { ...owner.params, campaignId: next.campaignId },
        });

        assert.deepStrictEqual(
          (yield* sentWith(next.subject)).map((email) => email.to),
          ["grace@example.com"]
        );
        assert.strictEqual(sent.status, "sent");
        assert.deepStrictEqual(
          { ...sent.recipients },
          { failed: 1, sent: 1, total: 2 }
        );
      })
  );

  test.effect(
    "skips a Contact who stops marketing email after the email before theirs in the same batch was sent",
    () =>
      Effect.gen(function* optOutMidBatch() {
        const owner = yield* ownOrganization;
        const list = yield* newList(owner, "Weekly picks");

        const addresses = Array.from(
          { length: 3 },
          (_, index) => `reader-${index}@example.com`
        );

        const first = yield* sendCampaign(owner, list.id, addresses);

        const contacts = yield* owner.client.contacts.list({
          params: owner.params,
          query: { list: list.id },
        });

        const [, secondInBatch] = (contacts?.contacts ?? []).toSorted((a, b) =>
          a.id < b.id ? -1 : 1
        );

        const link = first.find((email) => email.to === secondInBatch?.email);

        const next = yield* startCampaign(owner, list.id, []);

        const optOut = post(
          unsubscribePath(link ?? {}).replace(
            "/unsubscribe?",
            "/unsubscribe/all?"
          ),
          FROM_PAGE
        ).pipe(
          Effect.asVoid,
          Effect.provideService(AppFetch, yield* AppFetch),
          Effect.orDie
        );

        yield* (yield* SmtpOutbox).afterNextSend(optOut);
        yield* (yield* QueueWorker).deliverAll;

        const sentTo = (yield* sentWith(next.subject)).map((email) => email.to);

        assert.strictEqual(sentTo.length, 2);
        assert.notInclude(sentTo, secondInBatch?.email);
      })
  );
});
