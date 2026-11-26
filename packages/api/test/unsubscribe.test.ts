import { assert, layer } from "@effect/vitest";
import { SmtpOutbox } from "@repo/core/testing";
import type { ListId } from "@repo/domain";
import { Effect, pipe } from "effect";

import { ownOrganization } from "./accounts.ts";
import { APP_URL, AppFetch, QueueWorker, TestApp } from "./harness.ts";

type Owner = Effect.Success<typeof ownOrganization>;

const ONE_CLICK = "List-Unsubscribe=One-Click";

const FROM_PAGE = "from=page";

let campaigns = 0;

const newList = ({ client, params }: Owner, name: string) =>
  client.lists.create({ params, payload: { name } });

const startCampaign = (
  owner: Owner,
  listId: ListId,
  emails: readonly string[]
) =>
  Effect.gen(function* startSendingToList() {
    campaigns += 1;

    const { client, params } = owner;

    yield* pipe(
      emails,
      Effect.forEach((email) =>
        client.contacts
          .create({ params, payload: { email, listIds: [listId] } })
          .pipe(Effect.ignore)
      )
    );

    const connection = yield* client.providerConnections.create({
      params,
      payload: {
        from: { email: "hello@acme.example" },
        name: "Postmark",
        smtp: { host: "smtp.example.com", port: 587, security: "starttls" },
      },
    });

    const subject = `News #${campaigns}`;

    const campaign = yield* client.campaigns.create({
      params,
      payload: {
        from: { email: "news@acme.example", name: "Acme News" },
        html: "<html><body><p>Hello!</p></body></html>",
        listId,
        providerConnectionId: connection.id,
        replyTo: "replies@acme.example",
        subject,
      },
    });

    yield* client.campaigns.send({
      params: { ...params, campaignId: campaign.id },
    });

    return { campaignId: campaign.id, subject };
  });

const sentWith = (subject: string) =>
  Effect.gen(function* sentEmails() {
    const outbox = yield* SmtpOutbox;

    return (yield* outbox.sent)
      .filter((sent) => sent.email.subject === subject)
      .map((sent) => sent.email);
  });

const sendCampaign = (
  owner: Owner,
  listId: ListId,
  emails: readonly string[]
) =>
  Effect.gen(function* sendToList() {
    const { subject } = yield* startCampaign(owner, listId, emails);

    yield* (yield* QueueWorker).deliverAll;

    return yield* sentWith(subject);
  });

const unsubscribePath = (email: {
  readonly headers?: Record<string, string>;
}) =>
  (email.headers?.["List-Unsubscribe"] ?? "").slice(`<${APP_URL}`.length, -1);

const responseOf = (response: Response) =>
  Effect.gen(function* readResponse() {
    return {
      html: yield* Effect.promise(() => response.text()),
      location: response.headers.get("location"),
      status: response.status,
    };
  });

const open = (path: string) =>
  Effect.gen(function* openPage() {
    const fetch = yield* AppFetch;

    return yield* responseOf(
      yield* Effect.promise(() => fetch(`${APP_URL}${path}`))
    );
  });

const post = (path: string, body: string) =>
  Effect.gen(function* postForm() {
    const fetch = yield* AppFetch;

    return yield* responseOf(
      yield* Effect.promise(() =>
        fetch(`${APP_URL}${path}`, {
          body,
          headers: { "content-type": "application/x-www-form-urlencoded" },
          method: "POST",
          redirect: "manual",
        })
      )
    );
  });

const postMultipart = (path: string) =>
  Effect.gen(function* postMultipartForm() {
    const fetch = yield* AppFetch;
    const body = new FormData();

    body.set("List-Unsubscribe", "One-Click");

    return yield* responseOf(
      yield* Effect.promise(() =>
        fetch(`${APP_URL}${path}`, {
          body,
          method: "POST",
          redirect: "manual",
        })
      )
    );
  });

const statusOn = ({ client, params }: Owner, listId: ListId, email: string) =>
  Effect.gen(function* subscriptionStatus() {
    const page = yield* client.contacts.list({
      params,
      query: { list: listId },
    });

    return page?.contacts
      .find((contact) => contact.email === email)
      ?.subscriptions.find((subscription) => subscription.listId === listId)
      ?.status;
  });

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
        assert.match(
          ada?.html ?? "",
          /Unsubscribe<\/a><\/p><\/body><\/html>$/u
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
});
