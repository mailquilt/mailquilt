import { assert, layer } from "@effect/vitest";
import { SEND_BATCH_SIZE } from "@repo/core";
import { QueueInbox, SmtpOutbox } from "@repo/core/testing";
import {
  CampaignIdSchema,
  ListIdSchema,
  ProviderConnectionIdSchema,
  SendFailed,
} from "@repo/domain";
import type { ContactId, ListId } from "@repo/domain";
import { Effect, pipe } from "effect";
import { SqlClient } from "effect/sql";

import { ownOrganization } from "./accounts.ts";
import { QueueWorker, TestApp } from "./harness.ts";

type Owner = Effect.Success<typeof ownOrganization>;

const CAMPAIGN_ID = /^cmp_[0-7][0-9a-hjkmnp-tv-z]{25}$/u;

const NO_SUCH_CAMPAIGN = CampaignIdSchema.make(
  "cmp_00000000000000000000000000"
);

const NO_SUCH_LIST = ListIdSchema.make("lst_00000000000000000000000000");

const NO_SUCH_CONNECTION = ProviderConnectionIdSchema.make(
  "pcn_00000000000000000000000000"
);

const CONTENT = {
  from: { email: "news@acme.example", name: "Acme News" },
  html: "<h1>This week at Acme</h1><p>Hello!</p>",
  replyTo: "replies@acme.example",
  subject: "This week at Acme",
} as const;

const NOT_SENT = { failed: 0, sent: 0, total: 0 };

let campaigns = 0;

const draftCampaign = Effect.gen(function* draftCampaign() {
  campaigns += 1;

  const { client, params } = yield* ownOrganization;

  const list = yield* client.lists.create({
    params,
    payload: { name: "Weekly news" },
  });

  const connection = yield* client.providerConnections.create({
    params,
    payload: {
      from: { email: "hello@acme.example" },
      name: "Postmark",
      smtp: { host: "smtp.example.com", port: 587, security: "starttls" },
    },
  });

  const campaign = yield* client.campaigns.create({
    params,
    payload: {
      ...CONTENT,
      subject: `${CONTENT.subject} #${campaigns}`,
      listId: list.id,
      providerConnectionId: connection.id,
    },
  });

  return {
    campaign,
    client,
    connection,
    list,
    params,
    campaignParams: { ...params, campaignId: campaign.id },
  };
});

const addContacts = (
  { client, params }: Owner,
  emails: readonly string[],
  listIds: readonly ListId[]
) =>
  pipe(
    emails,
    Effect.forEach((email) =>
      client.contacts.create({ params, payload: { email, listIds } })
    )
  );

const setStatus = (contact: ContactId, status: string) =>
  Effect.gen(function* setSubscriptionStatus() {
    const sql = yield* SqlClient.SqlClient;
    yield* sql`update subscriptions set status = ${status} where contact_id = ${contact}`;
  });

const sentTo = (subject: string) =>
  Effect.gen(function* recipientsOfSubject() {
    const outbox = yield* SmtpOutbox;
    const sent = yield* outbox.sent;

    return sent
      .filter((send) => send.email.subject === subject)
      .map((send) => send.email.to)
      .toSorted();
  });

layer(TestApp, { timeout: "2 minutes" })("Campaigns", (test) => {
  test.effect(
    "creates a draft, changes it, and lists Campaigns newest first",
    () =>
      Effect.gen(function* draftAndList() {
        const { campaign, campaignParams, client, connection, list, params } =
          yield* draftCampaign;

        assert.match(campaign.id, CAMPAIGN_ID);
        assert.strictEqual(campaign.status, "draft");
        assert.strictEqual(
          campaign.subject,
          `${CONTENT.subject} #${campaigns}`
        );
        assert.strictEqual(campaign.html, CONTENT.html);
        assert.strictEqual(campaign.replyTo, CONTENT.replyTo);
        assert.deepStrictEqual({ ...campaign.from }, CONTENT.from);
        assert.strictEqual(campaign.listId, list.id);
        assert.strictEqual(campaign.providerConnectionId, connection.id);
        assert.deepStrictEqual({ ...campaign.recipients }, NOT_SENT);
        assert.isNull(campaign.sendingStartedAt);
        assert.isNull(campaign.sentAt);

        const changed = yield* client.campaigns.update({
          params: campaignParams,
          payload: {
            from: { email: "news@acme.example" },
            html: "<p>Changed</p>",
            listId: list.id,
            providerConnectionId: connection.id,
            subject: "Changed",
          },
        });

        assert.strictEqual(changed.subject, "Changed");
        assert.isNull(changed.replyTo);
        assert.deepStrictEqual(
          { ...changed.from },
          {
            email: "news@acme.example",
          }
        );
        assert.deepStrictEqual(
          yield* client.campaigns.get({ params: campaignParams }),
          changed
        );

        const later = yield* client.campaigns.create({
          params,
          payload: {
            ...CONTENT,
            listId: list.id,
            providerConnectionId: connection.id,
          },
        });

        const page = yield* client.campaigns.list({ params, query: {} });

        assert.deepStrictEqual(
          page.campaigns.map((summary) => summary.id),
          [later.id, campaign.id]
        );
        assert.strictEqual(page.total, 2);
        assert.isNull(page.next);
        assert.isNull(page.previous);
      })
  );

  test.effect(
    "refuses a draft whose List or Provider Connection the Organization doesn't have",
    () =>
      Effect.gen(function* missingParts() {
        const { campaignParams, client, connection, list, params } =
          yield* draftCampaign;

        const payload = {
          ...CONTENT,
          listId: list.id,
          providerConnectionId: connection.id,
        };

        const noList = yield* client.campaigns
          .create({ params, payload: { ...payload, listId: NO_SUCH_LIST } })
          .pipe(Effect.flip);

        const noConnection = yield* client.campaigns
          .update({
            params: campaignParams,
            payload: { ...payload, providerConnectionId: NO_SUCH_CONNECTION },
          })
          .pipe(Effect.flip);

        const noCampaign = yield* client.campaigns
          .send({ params: { ...params, campaignId: NO_SUCH_CAMPAIGN } })
          .pipe(Effect.flip);

        assert.strictEqual(noList._tag, "ListNotFound");
        assert.strictEqual(noConnection._tag, "ProviderConnectionNotFound");
        assert.strictEqual(noCampaign._tag, "CampaignNotFound");
      })
  );

  test.effect(
    "sends a Campaign once to each Contact subscribed to its List, and to no one else",
    () =>
      Effect.gen(function* sendToSubscribed() {
        const owner = yield* draftCampaign;
        const { campaign, campaignParams, client, list, params } = owner;

        const otherList = yield* client.lists.create({
          params,
          payload: { name: "Offers" },
        });

        yield* addContacts(
          owner,
          ["ada@example.com", "grace@example.com"],
          [list.id, otherList.id]
        );

        const [pending, unsubscribed] = yield* addContacts(
          owner,
          ["pending@example.com", "unsubscribed@example.com"],
          [list.id]
        );

        yield* setStatus(pending?.id ?? assert.fail(), "pending");
        yield* setStatus(unsubscribed?.id ?? assert.fail(), "unsubscribed");
        yield* addContacts(owner, ["offers-only@example.com"], [otherList.id]);
        yield* addContacts(owner, ["no-lists@example.com"], []);

        const sending = yield* client.campaigns.send({
          params: campaignParams,
        });

        assert.strictEqual(sending.status, "sending");
        assert.isNotNull(sending.sendingStartedAt);
        assert.deepStrictEqual(
          { ...sending.recipients },
          {
            failed: 0,
            sent: 0,
            total: 2,
          }
        );

        yield* (yield* QueueWorker).deliverAll;

        const sent = yield* client.campaigns.get({ params: campaignParams });

        assert.strictEqual(sent.status, "sent");
        assert.isNotNull(sent.sentAt);
        assert.deepStrictEqual(
          { ...sent.recipients },
          {
            failed: 0,
            sent: 2,
            total: 2,
          }
        );
        assert.deepStrictEqual(yield* sentTo(campaign.subject), [
          "ada@example.com",
          "grace@example.com",
        ]);

        const outbox = yield* SmtpOutbox;

        const email = (yield* outbox.sent).find(
          (send) => send.email.to === "ada@example.com"
        )?.email;

        assert.deepStrictEqual(email, {
          from: CONTENT.from,
          html: CONTENT.html,
          replyTo: CONTENT.replyTo,
          subject: campaign.subject,
          to: "ada@example.com",
        });
      })
  );

  test.effect(
    "records the Provider's message ID and a sent delivery event for each Contact it was sent to",
    () =>
      Effect.gen(function* messageIds() {
        const owner = yield* draftCampaign;
        const { campaign, campaignParams, client, list } = owner;

        yield* addContacts(owner, ["ada@example.com"], [list.id]);
        yield* client.campaigns.send({ params: campaignParams });
        yield* (yield* QueueWorker).deliverAll;

        const sends = yield* (yield* SmtpOutbox).sent;
        const messageId = `<${sends.length}@smtp.test>`;

        const sql = yield* SqlClient.SqlClient;

        const recipients = yield* sql`
          select email, status, provider_message_id from campaign_recipients
          where campaign_id = ${campaign.id}`;

        const events = yield* sql`
          select kind, provider_message_id from delivery_events
          where campaign_id = ${campaign.id}`;

        assert.strictEqual(sends.at(-1)?.email.to, "ada@example.com");
        assert.deepStrictEqual(recipients, [
          {
            email: "ada@example.com",
            provider_message_id: messageId,
            status: "sent",
          },
        ]);
        assert.deepStrictEqual(events, [
          { kind: "sent", provider_message_id: messageId },
        ]);
      })
  );

  test.effect(
    `sends in batches of ${SEND_BATCH_SIZE}, and is sent once the last batch is`,
    () =>
      Effect.gen(function* batches() {
        const { campaign, campaignParams, client, list, params } =
          yield* draftCampaign;

        const sql = yield* SqlClient.SqlClient;

        yield* sql`
          with made as (
            insert into contacts (id, organization_id, email)
            select 'cnt_' || lpad(n::text, 26, '0'), ${params.organizationId}, 'person-' || n || '@batch.example'
            from generate_series(1, ${SEND_BATCH_SIZE + 1}) as n
            returning id
          )
          insert into subscriptions (id, organization_id, list_id, contact_id, status)
          select 'sub_' || substr(id, 5), ${params.organizationId}, ${list.id}, id, 'subscribed'
          from made`;

        yield* client.campaigns.send({ params: campaignParams });

        const worker = yield* QueueWorker;
        const messages = yield* (yield* QueueInbox).takeAll;

        assert.lengthOf(messages, 2);

        yield* worker.deliver(messages[0] ?? assert.fail());

        const halfway = yield* client.campaigns.get({ params: campaignParams });

        yield* worker.deliver(messages[1] ?? assert.fail());

        const done = yield* client.campaigns.get({ params: campaignParams });

        assert.strictEqual(halfway.status, "sending");
        assert.deepStrictEqual(
          { ...halfway.recipients },
          {
            failed: 0,
            sent: SEND_BATCH_SIZE,
            total: SEND_BATCH_SIZE + 1,
          }
        );
        assert.strictEqual(done.status, "sent");
        assert.strictEqual(done.recipients.sent, SEND_BATCH_SIZE + 1);
        assert.lengthOf(yield* sentTo(campaign.subject), SEND_BATCH_SIZE + 1);
      })
  );

  test.effect(
    "records a Contact the Provider refused as failed and still sends to the others",
    () =>
      Effect.gen(function* providerRefuses() {
        const owner = yield* draftCampaign;
        const { campaign, campaignParams, client, list } = owner;

        yield* addContacts(
          owner,
          ["ada@example.com", "grace@example.com"],
          [list.id]
        );

        yield* client.campaigns.send({ params: campaignParams });

        const outbox = yield* SmtpOutbox;
        yield* outbox.failNextSend(
          new SendFailed({ detail: "550 No such user", reason: "rejected" })
        );
        yield* (yield* QueueWorker).deliverAll;

        const sent = yield* client.campaigns.get({ params: campaignParams });

        assert.strictEqual(sent.status, "sent");
        assert.deepStrictEqual(
          { ...sent.recipients },
          {
            failed: 1,
            sent: 1,
            total: 2,
          }
        );
        assert.lengthOf(yield* sentTo(campaign.subject), 1);
      })
  );

  test.effect(
    "stops trying a batch once the Provider's server can't be reached, and records the rest as failed with why",
    () =>
      Effect.gen(function* serverUnreachable() {
        const owner = yield* draftCampaign;

        const { campaign, campaignParams, client, list } = owner;

        yield* addContacts(
          owner,
          ["ada@example.com", "alan@example.com", "grace@example.com"],
          [list.id]
        );

        yield* client.campaigns.send({ params: campaignParams });

        const outbox = yield* SmtpOutbox;

        yield* outbox.failNextSend(
          new SendFailed({
            detail: "Connection timed out",
            reason: "unreachable",
          })
        );
        yield* (yield* QueueWorker).deliverAll;

        const sent = yield* client.campaigns.get({ params: campaignParams });

        const sql = yield* SqlClient.SqlClient;

        const reasons = yield* sql<{ readonly failure_detail: string }>`
          select distinct failure_detail from campaign_recipients
          where campaign_id = ${campaign.id}`;

        assert.strictEqual(sent.status, "sent");
        assert.deepStrictEqual(
          { ...sent.recipients },
          {
            failed: 3,
            sent: 0,
            total: 3,
          }
        );
        assert.isEmpty(yield* sentTo(campaign.subject));
        assert.deepStrictEqual(
          reasons.map((row) => row.failure_detail),
          ["Connection timed out"]
        );
      })
  );

  test.effect(
    "finishes a Campaign whose last batch was recorded but not yet marked sent when its message comes again",
    () =>
      Effect.gen(function* recordedButNotFinished() {
        const owner = yield* draftCampaign;

        const { campaign, campaignParams, client, list } = owner;

        yield* addContacts(owner, ["ada@example.com"], [list.id]);
        yield* client.campaigns.send({ params: campaignParams });

        const worker = yield* QueueWorker;
        const [message] = yield* worker.deliverAll;

        const sql = yield* SqlClient.SqlClient;

        yield* sql`update campaigns set status = 'sending', sent_at = null where id = ${campaign.id}`;
        yield* worker.deliver(message ?? assert.fail());

        const finished = yield* client.campaigns.get({ params: campaignParams });

        assert.strictEqual(finished.status, "sent");
        assert.lengthOf(yield* sentTo(campaign.subject), 1);
      })
  );

  test.effect("sends a batch delivered twice only once", () =>
    Effect.gen(function* deliveredTwice() {
      const owner = yield* draftCampaign;
      const { campaign, campaignParams, client, list } = owner;

      yield* addContacts(owner, ["ada@example.com"], [list.id]);
      yield* client.campaigns.send({ params: campaignParams });

      const worker = yield* QueueWorker;
      const [message] = yield* worker.deliverAll;

      yield* worker.deliver(message ?? assert.fail());

      assert.deepStrictEqual(yield* sentTo(campaign.subject), [
        "ada@example.com",
      ]);
    })
  );

  test.effect(
    "sends a Campaign only once, and never changes it after it starts sending",
    () =>
      Effect.gen(function* onlyOnce() {
        const owner = yield* draftCampaign;
        const { campaign, campaignParams, client, connection, list } = owner;

        yield* addContacts(owner, ["ada@example.com"], [list.id]);
        yield* client.campaigns.send({ params: campaignParams });

        const again = yield* client.campaigns
          .send({ params: campaignParams })
          .pipe(Effect.flip);

        const edit = yield* client.campaigns
          .update({
            params: campaignParams,
            payload: {
              ...CONTENT,
              listId: list.id,
              providerConnectionId: connection.id,
            },
          })
          .pipe(Effect.flip);

        yield* (yield* QueueWorker).deliverAll;

        assert.strictEqual(again._tag, "CampaignNotDraft");
        assert.strictEqual(edit._tag, "CampaignNotDraft");
        assert.deepStrictEqual(yield* sentTo(campaign.subject), [
          "ada@example.com",
        ]);
      })
  );

  test.effect(
    "keeps a Campaign a draft when its List has no subscribed Contact",
    () =>
      Effect.gen(function* noOneToSendTo() {
        const owner = yield* draftCampaign;
        const { campaignParams, client, list } = owner;

        const [pending] = yield* addContacts(
          owner,
          ["pending@example.com"],
          [list.id]
        );

        yield* setStatus(pending?.id ?? assert.fail(), "pending");

        const error = yield* client.campaigns
          .send({ params: campaignParams })
          .pipe(Effect.flip);

        const after = yield* client.campaigns.get({ params: campaignParams });

        assert.strictEqual(error._tag, "NoSubscribedContacts");
        assert.strictEqual(after.status, "draft");
        assert.deepStrictEqual({ ...after.recipients }, NOT_SENT);
        assert.isEmpty(yield* (yield* QueueWorker).deliverAll);
      })
  );

  test.effect(
    "keeps a draft whose Provider Connection was deleted, and won't send it",
    () =>
      Effect.gen(function* connectionDeleted() {
        const owner = yield* draftCampaign;
        const { campaignParams, client, connection, list, params } = owner;

        yield* addContacts(owner, ["ada@example.com"], [list.id]);
        yield* client.providerConnections.delete({
          params: { ...params, providerConnectionId: connection.id },
        });

        const draft = yield* client.campaigns.get({ params: campaignParams });

        const error = yield* client.campaigns
          .send({ params: campaignParams })
          .pipe(Effect.flip);

        assert.isNull(draft.providerConnectionId);
        assert.strictEqual(draft.status, "draft");
        assert.strictEqual(error._tag, "ProviderConnectionNotFound");
      })
  );

  test.effect(
    "records the Contacts left as failed when its Provider Connection is deleted while sending",
    () =>
      Effect.gen(function* deletedWhileSending() {
        const owner = yield* draftCampaign;

        const { campaign, campaignParams, client, connection, list, params } =
          owner;

        yield* addContacts(owner, ["ada@example.com"], [list.id]);
        yield* client.campaigns.send({ params: campaignParams });
        yield* client.providerConnections.delete({
          params: { ...params, providerConnectionId: connection.id },
        });
        yield* (yield* QueueWorker).deliverAll;

        const sent = yield* client.campaigns.get({ params: campaignParams });

        assert.strictEqual(sent.status, "sent");
        assert.deepStrictEqual(
          { ...sent.recipients },
          {
            failed: 1,
            sent: 0,
            total: 1,
          }
        );
        assert.isEmpty(yield* sentTo(campaign.subject));
      })
  );
});
