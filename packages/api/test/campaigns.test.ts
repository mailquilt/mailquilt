import { setTimeout } from "node:timers/promises";

import { assert, layer } from "@effect/vitest";
import { QUEUE_RETRIES, SendDeferred } from "@repo/core";
import type { OutgoingEmail } from "@repo/core";
import {
  QueueInbox,
  RECORDING_SES_MAX_SEND_RATE,
  SesOutbox,
  SmtpOutbox,
} from "@repo/core/testing";
import {
  CampaignIdSchema,
  ListIdSchema,
  MAX_CAMPAIGN_HTML_BYTES,
  MAX_CAMPAIGN_LISTS,
  ProviderConnectionIdSchema,
  SendFailed,
} from "@repo/domain";
import type { ContactId, ListId } from "@repo/domain";
import {
  Array as Arr,
  Clock,
  DateTime,
  Duration,
  Effect,
  Exit,
  Fiber,
  Option,
  pipe,
  Redacted,
} from "effect";
import { SqlClient } from "effect/sql";
import { TestClock } from "effect/testing";

import {
  clientWithCookie,
  ownOrganization,
  send as request,
  signedInPerson,
} from "./accounts.ts";
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

const CONNECTION_REFUSED = new SendDeferred({
  failed: new SendFailed({
    detail: "connect ECONNREFUSED 192.0.2.25:587",
    reason: "unreachable",
  }),
});

const SENDING_RATE_EXCEEDED = new SendDeferred({
  everyEmail: true,
  failed: new SendFailed({
    detail: "TooManyRequestsException: Maximum sending rate exceeded.",
    reason: "failed",
  }),
});

const MAILBOX_BUSY = new SendDeferred({
  failed: new SendFailed({
    detail: "450 4.2.1 Mailbox busy, try again later",
    reason: "rejected",
  }),
});

const THREE_CONTACTS = [
  "ada@example.com",
  "alan@example.com",
  "grace@example.com",
];

let campaigns = 0;

const POSTAL_ADDRESS = "Unit 3 & 4, Mill Lane\nBristol BS1 4XE";

const draftCampaignIn = (postalAddress: string | null) =>
  Effect.gen(function* draftCampaign() {
    campaigns += 1;

    const { client, params } = yield* ownOrganization;

    if (postalAddress !== null) {
      yield* client.organizations.updatePostalAddress({
        params,
        payload: { postalAddress },
      });
    }

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
        excludedListIds: [],
        listIds: [list.id],
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

const draftCampaign = draftCampaignIn(POSTAL_ADDRESS);

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

const NINE_IN_NEW_YORK = {
  localDateTime: "2099-12-01T09:00",
  timeZone: "America/New_York",
} as const;

const NINE_IN_NEW_YORK_UTC = DateTime.makeUnsafe("2099-12-01T14:00:00Z");

// WARNING: the app checks a schedule isn't in the past against the real clock, so schedules are far ahead of it; the test's own clock only decides when the in-process Queue delivers them.
const setClock = (time: DateTime.Utc) =>
  TestClock.setTime(DateTime.toEpochMillis(time));

const withOwnClock = Effect.provide(TestClock.layer());

const REAL_PAUSE_MS = 20;

const TEN_A_MINUTE = 10;

const SIX_SECONDS_MS = 60_000 / TEN_A_MINUTE;

const SIX_EMAILS = 6;

const TWELVE_A_MINUTE_PER_SECOND = 0.2;

const FIVE_SECONDS_MS = 5000;

const ONE_SECOND_MS = 1000;

const THOUSAND_A_SECOND = 1000;

const FORTY_ONE = 41;

const FORTY = 40;

const MAX_CLOCK_TICKS = 120;

const STALL_MS = 30_000;

const sendTimesOf = (
  sent: Effect.Effect<
    readonly { readonly email: OutgoingEmail; readonly at: DateTime.Utc }[]
  >,
  subject: string,
  count: number
) =>
  Effect.gen(function* sendTimes() {
    const worker = yield* QueueWorker;
    const batches = yield* (yield* QueueInbox).takeAll;
    const start = yield* Clock.currentTimeMillis;

    const sending = yield* Effect.forEach(
      batches,
      (batch) => worker.deliver(batch),
      { concurrency: "unbounded" }
    ).pipe(Effect.forkChild);

    const sentAt = sent.pipe(
      Effect.map((sends) =>
        sends
          .filter((send) => send.email.subject.startsWith(subject))
          .map((send) => DateTime.toEpochMillis(send.at) - start)
          .toSorted((a, b) => a - b)
      )
    );

    // WARNING: the batches wait on the test's clock but query a real Postgres, so the clock moves a second at a time with a real pause between, and an email can be recorded after its slot but never before it; tests check only that each is no earlier than its slot.
    const times = yield* TestClock.adjust(Duration.seconds(1)).pipe(
      Effect.andThen(Effect.promise(() => setTimeout(REAL_PAUSE_MS))),
      Effect.andThen(sentAt),
      Effect.repeat({
        times: MAX_CLOCK_TICKS,
        until: (sentSoFar) => sentSoFar.length >= count,
      })
    );

    assert.lengthOf(times, count);

    yield* Fiber.join(sending);

    return times;
  });

const assertNoEarlierThanSlots = (
  times: readonly number[],
  intervalMs: number
) =>
  assert.isTrue(
    times.every((time, slot) => time >= slot * intervalMs),
    `Sent at ${JSON.stringify(times)} ms, slots ${intervalMs} ms apart`
  );

const SES_ACCOUNT = {
  credentials: {
    accessKeyId: Redacted.make("AKIAIOSFODNN7EXAMPLE"),
    secretAccessKey: Redacted.make("wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"),
  },
  provider: "ses",
  ses: { region: "eu-west-1" },
} as const;

const sendThroughSes = (
  { client, connection, params }: Effect.Success<typeof draftCampaign>,
  maxSendRate: Option.Option<number>,
  emailsPerMinute: number | null = null
) =>
  Effect.gen(function* moveToSes() {
    const outbox = yield* SesOutbox;

    yield* client.providerConnections.update({
      params: { ...params, providerConnectionId: connection.id },
      payload: {
        ...SES_ACCOUNT,
        emailsPerMinute,
        from: connection.from,
        name: connection.name,
      },
    });
    yield* Effect.addFinalizer(() =>
      outbox.setMaxSendRate(Option.some(RECORDING_SES_MAX_SEND_RATE))
    );
    yield* outbox.setMaxSendRate(maxSendRate);
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
        assert.deepStrictEqual(campaign.listIds, [list.id]);
        assert.deepStrictEqual(campaign.excludedListIds, []);
        assert.strictEqual(campaign.providerConnectionId, connection.id);
        assert.deepStrictEqual({ ...campaign.recipients }, NOT_SENT);
        assert.isNull(campaign.sendingStartedAt);
        assert.isNull(campaign.sentAt);

        const changed = yield* client.campaigns.update({
          params: campaignParams,
          payload: {
            from: { email: "news@acme.example" },
            html: "<p>Changed</p>",
            excludedListIds: [],
            listIds: [list.id],
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
            excludedListIds: [],
            listIds: [list.id],
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
          excludedListIds: [],
          listIds: [list.id],
          providerConnectionId: connection.id,
        };

        const noList = yield* client.campaigns
          .create({ params, payload: { ...payload, listIds: [NO_SUCH_LIST] } })
          .pipe(Effect.flip);

        const noConnection = yield* client.campaigns
          .update({
            params: campaignParams,
            payload: { ...payload, providerConnectionId: NO_SUCH_CONNECTION },
          })
          .pipe(Effect.flip);

        const noExcludedList = yield* client.campaigns
          .update({
            params: campaignParams,
            payload: { ...payload, excludedListIds: [NO_SUCH_LIST] },
          })
          .pipe(Effect.flip);

        const noCampaign = yield* client.campaigns
          .send({ params: { ...params, campaignId: NO_SUCH_CAMPAIGN } })
          .pipe(Effect.flip);

        assert.strictEqual(noList._tag, "ListNotFound");
        assert.strictEqual(noExcludedList._tag, "ListNotFound");
        assert.strictEqual(noConnection._tag, "ProviderConnectionNotFound");
        assert.strictEqual(noCampaign._tag, "CampaignNotFound");
      })
  );

  test.effect(
    "refuses to send a Campaign until its Organization has a postal address, and leaves it a draft",
    () =>
      Effect.gen(function* noPostalAddress() {
        const owner = yield* draftCampaignIn(null);
        const { campaignParams, client, list } = owner;

        yield* addContacts(owner, ["ada@example.com"], [list.id]);

        const refused = yield* client.campaigns
          .send({ params: campaignParams })
          .pipe(Effect.flip);

        const after = yield* client.campaigns.get({ params: campaignParams });

        assert.strictEqual(refused._tag, "PostalAddressRequired");
        assert.strictEqual(after.status, "draft");
        assert.deepStrictEqual({ ...after.recipients }, NOT_SENT);
        assert.isEmpty(yield* (yield* QueueWorker).deliverAll);
      })
  );

  test.effect(
    "sends a Campaign once to each Contact subscribed to its List whose address isn't Suppressed, and to no one else",
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
        yield* addContacts(owner, ["suppressed@example.com"], [list.id]);
        yield* client.suppressions.add({
          params,
          payload: { emails: ["Suppressed@Example.com"] },
        });

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
          (send) =>
            send.email.to === "ada@example.com" &&
            send.email.subject === campaign.subject
        )?.email;

        const { headers, html, text, ...rest } = email ?? assert.fail();

        assert.deepStrictEqual(rest, {
          from: CONTENT.from,
          replyTo: CONTENT.replyTo,
          subject: campaign.subject,
          to: "ada@example.com",
        });
        assert.isTrue(html?.startsWith(CONTENT.html));
        assert.isTrue(text?.startsWith("THIS WEEK AT ACME\n\nHello!\n\n"));
        assert.include(
          html,
          ">Acme, Unit 3 &amp; 4, Mill Lane, Bristol BS1 4XE</p>"
        );
        assert.isTrue(
          text?.endsWith("\n\nAcme, Unit 3 & 4, Mill Lane, Bristol BS1 4XE")
        );
        assert.isDefined(headers?.["List-Unsubscribe"]);
      })
  );

  test.effect(
    "sends a Campaign once to each Contact subscribed to any of its Lists, leaving out anyone with a Subscription to an excluded List",
    () =>
      Effect.gen(function* sendToSeveralLists() {
        const owner = yield* draftCampaign;

        const { campaign, campaignParams, client, connection, list, params } =
          owner;

        const offers = yield* client.lists.create({
          params,
          payload: { name: "Offers" },
        });

        const customers = yield* client.lists.create({
          params,
          payload: { name: "Customers" },
        });

        yield* addContacts(owner, ["both@example.com"], [list.id, offers.id]);
        yield* addContacts(owner, ["offers@example.com"], [offers.id]);
        yield* addContacts(
          owner,
          ["customer@example.com"],
          [list.id, customers.id]
        );

        const [pendingCustomer, formerCustomer] = yield* addContacts(
          owner,
          ["pending-customer@example.com", "former-customer@example.com"],
          [list.id, customers.id]
        );

        const sql = yield* SqlClient.SqlClient;
        const pendingId = pendingCustomer?.id ?? assert.fail();
        const formerId = formerCustomer?.id ?? assert.fail();

        yield* sql`
          update subscriptions
          set status = case contact_id when ${pendingId} then 'pending' else 'unsubscribed' end
          where list_id = ${customers.id} and contact_id in (${pendingId}, ${formerId})`;

        yield* client.campaigns.update({
          params: campaignParams,
          payload: {
            ...CONTENT,
            excludedListIds: [customers.id],
            listIds: [list.id, offers.id],
            providerConnectionId: connection.id,
            subject: campaign.subject,
          },
        });

        const sending = yield* client.campaigns.send({
          params: campaignParams,
        });

        yield* (yield* QueueWorker).deliverAll;

        assert.deepStrictEqual(
          sending.listIds,
          [list.id, offers.id].toSorted()
        );
        assert.deepStrictEqual(sending.excludedListIds, [customers.id]);
        assert.strictEqual(sending.recipients.total, 2);
        assert.deepStrictEqual(yield* sentTo(campaign.subject), [
          "both@example.com",
          "offers@example.com",
        ]);
      })
  );

  test.effect(
    "counts the Contacts a Campaign to some Lists would reach now, leaving out the same Contacts a send does",
    () =>
      Effect.gen(function* countRecipients() {
        const owner = yield* draftCampaign;
        const { client, list, params } = owner;

        const offers = yield* client.lists.create({
          params,
          payload: { name: "Offers" },
        });

        const customers = yield* client.lists.create({
          params,
          payload: { name: "Customers" },
        });

        yield* addContacts(owner, ["both@example.com"], [list.id, offers.id]);
        yield* addContacts(owner, ["offers@example.com"], [offers.id]);
        yield* addContacts(
          owner,
          ["customer@example.com"],
          [list.id, customers.id]
        );
        yield* addContacts(owner, ["suppressed@example.com"], [list.id]);

        const [optedOut] = yield* addContacts(
          owner,
          ["opted-out@example.com"],
          [list.id]
        );

        const sql = yield* SqlClient.SqlClient;

        yield* sql`update contacts set opted_out_at = now() where id = ${optedOut?.id ?? assert.fail()}`;
        yield* client.suppressions.add({
          params,
          payload: { emails: ["suppressed@example.com"] },
        });

        const count = yield* client.campaigns.countRecipients({
          params,
          query: {
            excludedListIds: [customers.id],
            listIds: [list.id, offers.id],
          },
        });

        const unknownList = yield* client.campaigns
          .countRecipients({
            params,
            query: { excludedListIds: [NO_SUCH_LIST], listIds: [list.id] },
          })
          .pipe(Effect.flip);

        assert.deepStrictEqual({ ...count }, { recipients: 2 });
        assert.strictEqual(unknownList._tag, "ListNotFound");
      })
  );

  test.effect(
    "accepts a draft with every field at its longest, within the API's request size",
    () =>
      Effect.gen(function* longestDraft() {
        const { campaignParams, client, connection, params } =
          yield* draftCampaign;

        const lists = yield* pipe(
          Array.from(
            { length: MAX_CAMPAIGN_LISTS * 2 },
            (_, index) => `List ${index}`
          ),
          Effect.forEach((name) =>
            client.lists.create({ params, payload: { name } })
          )
        );

        const ids = lists.map((list) => list.id);
        const address = `${"a".repeat(64)}@${"b".repeat(63)}.${"c".repeat(63)}.${"d".repeat(57)}.com`;
        const escaped = "\u0001";

        const longest = yield* client.campaigns.update({
          params: campaignParams,
          payload: {
            excludedListIds: ids.slice(MAX_CAMPAIGN_LISTS),
            from: { email: address, name: escaped.repeat(100) },
            html: "a".repeat(MAX_CAMPAIGN_HTML_BYTES - 2),
            listIds: ids.slice(0, MAX_CAMPAIGN_LISTS),
            providerConnectionId: connection.id,
            replyTo: address,
            subject: escaped.repeat(200),
          },
        });

        assert.lengthOf(longest.listIds, MAX_CAMPAIGN_LISTS);
        assert.lengthOf(longest.excludedListIds, MAX_CAMPAIGN_LISTS);
      })
  );

  test.effect(
    "refuses a draft that names no List, or names one List both to send to and to leave out",
    () =>
      Effect.gen(function* listChoiceRefused() {
        const cookie = yield* signedInPerson;
        const client = yield* clientWithCookie(cookie);

        const organization = yield* client.organizations.create({
          payload: { name: "Acme" },
        });

        const params = { organizationId: organization.id };

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

        const path = `/api/organizations/${organization.id}/campaigns`;
        const draft = { ...CONTENT, providerConnectionId: connection.id };

        const noList = yield* request("POST", path, {
          body: { ...draft, listIds: [] },
          headers: { cookie },
        });

        const both = yield* request("POST", path, {
          body: { ...draft, excludedListIds: [list.id], listIds: [list.id] },
          headers: { cookie },
        });

        const page = yield* client.campaigns.list({ params, query: {} });

        assert.strictEqual(noList.status, 400);
        assert.strictEqual(both.status, 400);
        assert.strictEqual(page.total, 0);
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
    "sends in batches of 100, and is sent once the last batch is",
    () =>
      Effect.gen(function* batches() {
        const { campaign, campaignParams, client, list, params } =
          yield* draftCampaign;

        const sql = yield* SqlClient.SqlClient;

        yield* sql`
          with made as (
            insert into contacts (id, organization_id, email)
            select 'cnt_' || lpad(n::text, 26, '0'), ${params.organizationId}, 'person-' || n || '@batch.example'
            from generate_series(1, 101) as n
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
            sent: 100,
            total: 101,
          }
        );
        assert.strictEqual(done.status, "sent");
        assert.strictEqual(done.recipients.sent, 101);
        assert.lengthOf(yield* sentTo(campaign.subject), 101);
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
    "tries a Contact again on the batch's next delivery when the Provider's server can't take their email now, and still sends to the others",
    () =>
      Effect.gen(function* mailboxBusy() {
        const owner = yield* draftCampaign;
        const { campaign, campaignParams, client, list } = owner;

        yield* addContacts(
          owner,
          ["ada@example.com", "grace@example.com"],
          [list.id]
        );
        yield* client.campaigns.send({ params: campaignParams });

        const worker = yield* QueueWorker;
        const [message] = yield* (yield* QueueInbox).takeAll;
        const batch = message ?? assert.fail();

        yield* (yield* SmtpOutbox).failNextSend(MAILBOX_BUSY);

        const putOff = yield* Effect.exit(worker.deliver(batch));

        const partway = yield* client.campaigns.get({
          params: campaignParams,
        });

        const sentFirst = yield* sentTo(campaign.subject);

        yield* worker.deliver(batch);

        const done = yield* client.campaigns.get({ params: campaignParams });

        assert.isTrue(Exit.isFailure(putOff));
        assert.strictEqual(partway.status, "sending");
        assert.deepStrictEqual(sentFirst, ["grace@example.com"]);
        assert.strictEqual(done.status, "sent");
        assert.deepStrictEqual(
          { ...done.recipients },
          { failed: 0, sent: 2, total: 2 }
        );
        assert.deepStrictEqual(yield* sentTo(campaign.subject), [
          "ada@example.com",
          "grace@example.com",
        ]);
      })
  );

  test.effect(
    "records an email the Provider puts off on the batch's last delivery as failed, though it's the first time that Contact was tried",
    () =>
      Effect.gen(function* putOffOnLastDelivery() {
        const owner = yield* draftCampaign;
        const { campaignParams, client, list } = owner;

        yield* addContacts(owner, ["ada@example.com"], [list.id]);
        yield* client.campaigns.send({ params: campaignParams });

        const [message] = yield* (yield* QueueInbox).takeAll;

        yield* (yield* SmtpOutbox).failNextSend(MAILBOX_BUSY);
        yield* (yield* QueueWorker).deliver(
          message ?? assert.fail(),
          QUEUE_RETRIES + 1
        );

        const done = yield* client.campaigns.get({ params: campaignParams });

        assert.strictEqual(done.status, "sent");
        assert.deepStrictEqual(
          { ...done.recipients },
          { failed: 1, sent: 0, total: 1 }
        );
      })
  );

  test.effect(
    "delivers a batch again when another delivery put one of its Contacts back while it was sending, rather than leave them unsent",
    () =>
      Effect.gen(function* putBackElsewhere() {
        const owner = yield* draftCampaign;
        const { campaign, campaignParams, client, list } = owner;

        yield* addContacts(
          owner,
          ["ada@example.com", "grace@example.com"],
          [list.id]
        );
        yield* client.campaigns.send({ params: campaignParams });

        const worker = yield* QueueWorker;
        const [message] = yield* (yield* QueueInbox).takeAll;
        const batch = message ?? assert.fail();
        const sql = yield* SqlClient.SqlClient;

        yield* sql`
          update campaign_recipients set status = 'sending', claimed_at = now()
          where campaign_id = ${campaign.id} and email = 'grace@example.com'`;
        yield* (yield* SmtpOutbox).afterNextSend(
          Effect.orDie(sql`
            update campaign_recipients set status = 'queued', claimed_at = null
            where campaign_id = ${campaign.id} and email = 'grace@example.com'`)
        );

        const first = yield* Effect.exit(worker.deliver(batch));

        yield* worker.deliver(batch);

        const done = yield* client.campaigns.get({ params: campaignParams });

        assert.isTrue(Exit.isFailure(first));
        assert.strictEqual(done.status, "sent");
        assert.deepStrictEqual(yield* sentTo(campaign.subject), [
          "ada@example.com",
          "grace@example.com",
        ]);
      })
  );

  test.effect(
    "stops trying a batch while the Provider's server can't be connected to, and sends the rest on its next delivery",
    () =>
      Effect.gen(function* serverDown() {
        const owner = yield* draftCampaign;
        const { campaign, campaignParams, client, list } = owner;

        yield* addContacts(owner, THREE_CONTACTS, [list.id]);
        yield* client.campaigns.send({ params: campaignParams });

        const worker = yield* QueueWorker;
        const [message] = yield* (yield* QueueInbox).takeAll;
        const batch = message ?? assert.fail();

        yield* (yield* SmtpOutbox).failNextSend(CONNECTION_REFUSED);

        const putOff = yield* Effect.exit(worker.deliver(batch));
        const sentFirst = yield* sentTo(campaign.subject);

        yield* worker.deliver(batch);

        const done = yield* client.campaigns.get({ params: campaignParams });

        assert.isTrue(Exit.isFailure(putOff));
        assert.isEmpty(sentFirst);
        assert.strictEqual(done.status, "sent");
        assert.deepStrictEqual(
          { ...done.recipients },
          { failed: 0, sent: 3, total: 3 }
        );
        assert.deepStrictEqual(yield* sentTo(campaign.subject), THREE_CONTACTS);
      })
  );

  test.effect(
    "puts off the rest of a batch, untried, when the Provider puts off every email for now, and sends them on its next delivery",
    () =>
      Effect.gen(function* everyEmailPutOff() {
        const owner = yield* draftCampaign;
        const { campaign, campaignParams, client, list } = owner;

        yield* addContacts(owner, THREE_CONTACTS, [list.id]);
        yield* client.campaigns.send({ params: campaignParams });

        const worker = yield* QueueWorker;
        const [message] = yield* (yield* QueueInbox).takeAll;
        const batch = message ?? assert.fail();

        yield* (yield* SmtpOutbox).failNextSend(SENDING_RATE_EXCEEDED);

        const putOff = yield* Effect.exit(worker.deliver(batch));
        const sentFirst = yield* sentTo(campaign.subject);

        yield* worker.deliver(batch);

        const done = yield* client.campaigns.get({ params: campaignParams });

        assert.isTrue(Exit.isFailure(putOff));
        assert.isEmpty(sentFirst);
        assert.deepStrictEqual(
          { ...done.recipients },
          { failed: 0, sent: 3, total: 3 }
        );
      })
  );

  test.effect(
    "records the rest of a batch failed, untried, when the Provider puts off every email on the queue's last delivery",
    () =>
      Effect.gen(function* everyEmailPutOffLast() {
        const owner = yield* draftCampaign;
        const { campaign, campaignParams, client, list } = owner;

        yield* addContacts(owner, THREE_CONTACTS, [list.id]);
        yield* client.campaigns.send({ params: campaignParams });

        const worker = yield* QueueWorker;
        const [message] = yield* (yield* QueueInbox).takeAll;

        yield* (yield* SmtpOutbox).failNextSend(SENDING_RATE_EXCEEDED);
        yield* worker.deliver(message ?? assert.fail(), QUEUE_RETRIES + 1);

        const done = yield* client.campaigns.get({ params: campaignParams });

        assert.isEmpty(yield* sentTo(campaign.subject));
        assert.strictEqual(done.status, "sent");
        assert.deepStrictEqual(
          { ...done.recipients },
          { failed: 3, sent: 0, total: 3 }
        );
      })
  );

  test.effect(
    "records a batch failed with why once the Provider's server couldn't be connected to on every delivery the queue makes",
    () =>
      Effect.gen(function* serverDownForGood() {
        const owner = yield* draftCampaign;
        const { campaign, campaignParams, client, list } = owner;

        yield* addContacts(
          owner,
          ["ada@example.com", "grace@example.com"],
          [list.id]
        );
        yield* client.campaigns.send({ params: campaignParams });

        const worker = yield* QueueWorker;
        const outbox = yield* SmtpOutbox;
        const [message] = yield* (yield* QueueInbox).takeAll;
        const batch = message ?? assert.fail();

        const deliveries = yield* pipe(
          Arr.makeBy(QUEUE_RETRIES + 1, (index) => index + 1),
          Effect.forEach((attempt) =>
            outbox
              .failNextSend(CONNECTION_REFUSED)
              .pipe(Effect.andThen(Effect.exit(worker.deliver(batch, attempt))))
          )
        );

        const done = yield* client.campaigns.get({ params: campaignParams });

        const sql = yield* SqlClient.SqlClient;

        const reasons = yield* sql<{ readonly failure_detail: string }>`
          select distinct failure_detail from campaign_recipients
          where campaign_id = ${campaign.id}`;

        assert.deepStrictEqual(deliveries.map(Exit.isFailure), [
          ...Arr.makeBy(QUEUE_RETRIES, () => true),
          false,
        ]);
        assert.isEmpty(yield* sentTo(campaign.subject));
        assert.strictEqual(done.status, "sent");
        assert.deepStrictEqual(
          { ...done.recipients },
          { failed: 2, sent: 0, total: 2 }
        );
        assert.deepStrictEqual(
          reasons.map((row) => row.failure_detail),
          [CONNECTION_REFUSED.failed.detail]
        );
      })
  );

  test.effect(
    "pauses a Campaign partway through a batch, holding its unsent emails, and resuming sends them",
    () =>
      Effect.gen(function* pauseAndResume() {
        const owner = yield* draftCampaign;
        const { campaign, campaignParams, client, list } = owner;

        yield* addContacts(owner, THREE_CONTACTS, [list.id]);
        yield* client.campaigns.send({ params: campaignParams });
        yield* (yield* SmtpOutbox).afterNextSend(
          Effect.orDie(client.campaigns.pause({ params: campaignParams }))
        );

        const worker = yield* QueueWorker;
        const inbox = yield* QueueInbox;

        yield* worker.deliverAll;

        const paused = yield* client.campaigns.get({ params: campaignParams });

        const pausedAgain = yield* client.campaigns.pause({
          params: campaignParams,
        });

        const sentWhilePaused = yield* sentTo(campaign.subject);
        const queuedWhilePaused = yield* inbox.takeAll;

        const resumed = yield* client.campaigns.resume({
          params: campaignParams,
        });

        yield* worker.deliverAll;

        const done = yield* client.campaigns.get({ params: campaignParams });

        assert.strictEqual(paused.status, "paused");
        assert.deepStrictEqual(
          { ...paused.recipients },
          { failed: 0, sent: 1, total: 3 }
        );
        assert.strictEqual(pausedAgain.status, "paused");
        assert.deepStrictEqual(sentWhilePaused, ["ada@example.com"]);
        assert.isEmpty(queuedWhilePaused);
        assert.strictEqual(resumed.status, "sending");
        assert.strictEqual(done.status, "sent");
        assert.deepStrictEqual(
          { ...done.recipients },
          { failed: 0, sent: 3, total: 3 }
        );
        assert.deepStrictEqual(yield* sentTo(campaign.subject), THREE_CONTACTS);
      })
  );

  test.effect(
    "resuming a paused Campaign queues every batch it hasn't finished, so one whose batch the queue dropped still finishes",
    () =>
      Effect.gen(function* resumeAfterDroppedBatch() {
        const owner = yield* draftCampaign;
        const { campaign, campaignParams, client, list } = owner;

        yield* addContacts(owner, ["ada@example.com"], [list.id]);
        yield* client.campaigns.send({ params: campaignParams });
        yield* (yield* QueueInbox).takeAll;

        yield* client.campaigns.pause({ params: campaignParams });
        yield* client.campaigns.resume({ params: campaignParams });
        yield* (yield* QueueWorker).deliverAll;

        const done = yield* client.campaigns.get({ params: campaignParams });

        assert.strictEqual(done.status, "sent");
        assert.deepStrictEqual(yield* sentTo(campaign.subject), [
          "ada@example.com",
        ]);
      })
  );

  test.effect(
    "answers a second cancel with the Campaign, also once the email in flight when it was cancelled is recorded",
    () =>
      Effect.gen(function* cancelAgain() {
        const owner = yield* draftCampaign;
        const { campaignParams, client, list } = owner;

        yield* addContacts(owner, ["ada@example.com"], [list.id]);
        yield* client.campaigns.send({ params: campaignParams });
        yield* (yield* SmtpOutbox).afterNextSend(
          Effect.orDie(client.campaigns.cancel({ params: campaignParams }))
        );
        yield* (yield* QueueWorker).deliverAll;

        const again = yield* client.campaigns.cancel({
          params: campaignParams,
        });

        assert.strictEqual(again.status, "cancelled");
        assert.deepStrictEqual(
          { ...again.recipients },
          { failed: 0, sent: 1, total: 1 }
        );
      })
  );

  test.effect(
    "cancels a Campaign partway through, and never sends the emails it hadn't sent",
    () =>
      Effect.gen(function* cancelMidSend() {
        const owner = yield* draftCampaign;
        const { campaign, campaignParams, client, list } = owner;

        yield* addContacts(owner, THREE_CONTACTS, [list.id]);
        yield* client.campaigns.send({ params: campaignParams });
        yield* (yield* SmtpOutbox).afterNextSend(
          Effect.orDie(client.campaigns.cancel({ params: campaignParams }))
        );

        const worker = yield* QueueWorker;
        const delivered = yield* worker.deliverAll;

        yield* pipe(
          delivered,
          Effect.forEach((message) => worker.deliver(message))
        );

        const cancelled = yield* client.campaigns.get({
          params: campaignParams,
        });

        const resumed = yield* client.campaigns
          .resume({ params: campaignParams })
          .pipe(Effect.flip);

        const paused = yield* client.campaigns
          .pause({ params: campaignParams })
          .pipe(Effect.flip);

        const cancelledAgain = yield* client.campaigns.cancel({
          params: campaignParams,
        });

        assert.strictEqual(cancelled.status, "cancelled");
        assert.deepStrictEqual(
          { ...cancelled.recipients },
          { failed: 0, sent: 1, total: 3 }
        );
        assert.deepStrictEqual(yield* sentTo(campaign.subject), [
          "ada@example.com",
        ]);
        assert.strictEqual(resumed._tag, "CampaignNotSending");
        assert.strictEqual(paused._tag, "CampaignNotSending");
        assert.strictEqual(cancelledAgain.status, "cancelled");
      })
  );

  test.effect(
    "won't pause or cancel a Campaign whose last email was recorded before it was marked sent, and marks it sent",
    () =>
      Effect.gen(function* lastEmailJustRecorded() {
        const owner = yield* draftCampaign;
        const { campaign, campaignParams, client, list } = owner;

        yield* addContacts(owner, ["ada@example.com"], [list.id]);
        yield* client.campaigns.send({ params: campaignParams });
        yield* (yield* QueueWorker).deliverAll;

        const sql = yield* SqlClient.SqlClient;

        yield* sql`update campaigns set status = 'sending', sent_at = null where id = ${campaign.id}`;

        const paused = yield* client.campaigns
          .pause({ params: campaignParams })
          .pipe(Effect.flip);

        const cancelled = yield* client.campaigns
          .cancel({ params: campaignParams })
          .pipe(Effect.flip);

        const after = yield* client.campaigns.get({ params: campaignParams });

        assert.strictEqual(paused._tag, "CampaignNotSending");
        assert.strictEqual(cancelled._tag, "CampaignNotSending");
        assert.strictEqual(after.status, "sent");
        assert.isNotNull(after.sentAt);
      })
  );

  test.effect(
    "refuses to pause, resume or cancel a Campaign that hasn't started sending or has been sent",
    () =>
      Effect.gen(function* notSending() {
        const owner = yield* draftCampaign;
        const { campaignParams, client, list } = owner;

        const refusals = (params: typeof campaignParams) =>
          Effect.all([
            client.campaigns.pause({ params }).pipe(Effect.flip),
            client.campaigns.resume({ params }).pipe(Effect.flip),
            client.campaigns.cancel({ params }).pipe(Effect.flip),
          ]);

        const ofDraft = yield* refusals(campaignParams);

        yield* addContacts(owner, ["ada@example.com"], [list.id]);
        yield* client.campaigns.send({ params: campaignParams });
        yield* (yield* QueueWorker).deliverAll;

        const ofSent = yield* refusals(campaignParams);

        const ofMissing = yield* refusals({
          ...campaignParams,
          campaignId: NO_SUCH_CAMPAIGN,
        });

        assert.deepStrictEqual(
          [...ofDraft, ...ofSent].map((error) => error._tag),
          Arr.makeBy(6, () => "CampaignNotSending" as const)
        );
        assert.deepStrictEqual(
          ofMissing.map((error) => error._tag),
          Arr.makeBy(3, () => "CampaignNotFound" as const)
        );
        assert.strictEqual(
          (yield* client.campaigns.get({ params: campaignParams })).status,
          "sent"
        );
      })
  );

  test.effect(
    "sends no faster than its Provider Connection's sending rate, even with another Campaign sending through it at the same moment",
    () =>
      Effect.gen(function* keepsToSendingRate() {
        const owner = yield* draftCampaign;

        const { campaign, campaignParams, client, connection, list, params } =
          owner;

        yield* client.providerConnections.update({
          params: { ...params, providerConnectionId: connection.id },
          payload: {
            emailsPerMinute: TEN_A_MINUTE,
            from: connection.from,
            name: connection.name,
            smtp: { host: "smtp.example.com", port: 587, security: "starttls" },
          },
        });

        const second = yield* client.campaigns.create({
          params,
          payload: {
            ...CONTENT,
            subject: `${campaign.subject} again`,
            excludedListIds: [],
            listIds: [list.id],
            providerConnectionId: connection.id,
          },
        });

        yield* addContacts(owner, THREE_CONTACTS, [list.id]);
        yield* client.campaigns.send({ params: campaignParams });
        yield* client.campaigns.send({
          params: { ...params, campaignId: second.id },
        });

        const times = yield* sendTimesOf(
          (yield* SmtpOutbox).sent,
          campaign.subject,
          SIX_EMAILS
        );

        assertNoEarlierThanSlots(times, SIX_SECONDS_MS);
      }).pipe(withOwnClock)
  );

  test.effect(
    "keeps an SES account without a sending rate of its own to the account's sending limit",
    () =>
      Effect.gen(function* keepsToSesLimit() {
        const owner = yield* draftCampaign;

        yield* sendThroughSes(owner, Option.some(TWELVE_A_MINUTE_PER_SECOND));
        yield* addContacts(owner, THREE_CONTACTS, [owner.list.id]);
        yield* owner.client.campaigns.send({ params: owner.campaignParams });

        const times = yield* sendTimesOf(
          (yield* SesOutbox).sent,
          owner.campaign.subject,
          THREE_CONTACTS.length
        );

        assertNoEarlierThanSlots(times, FIVE_SECONDS_MS);
      }).pipe(withOwnClock, Effect.scoped)
  );

  test.effect(
    "keeps an SES account to 1 email a second when its sending limit can't be read",
    () =>
      Effect.gen(function* lowestSesLimit() {
        const owner = yield* draftCampaign;

        yield* sendThroughSes(owner, Option.none());
        yield* addContacts(owner, THREE_CONTACTS, [owner.list.id]);
        yield* owner.client.campaigns.send({ params: owner.campaignParams });

        const times = yield* sendTimesOf(
          (yield* SesOutbox).sent,
          owner.campaign.subject,
          THREE_CONTACTS.length
        );

        assertNoEarlierThanSlots(times, ONE_SECOND_MS);
      }).pipe(withOwnClock, Effect.scoped)
  );

  test.effect(
    "splits a Campaign through SES into batches of 40, so each fits a Workers Free invocation's 50 requests",
    () =>
      Effect.gen(function* sesBatches() {
        const owner = yield* draftCampaign;

        yield* sendThroughSes(owner, Option.some(THOUSAND_A_SECOND));
        yield* addContacts(
          owner,
          Arr.makeBy(FORTY_ONE, (index) => `reader-${index}@example.com`),
          [owner.list.id]
        );
        yield* owner.client.campaigns.send({ params: owner.campaignParams });

        const batches = yield* (yield* QueueInbox).takeAll;

        assert.lengthOf(batches, 2);
      }).pipe(Effect.scoped)
  );

  test.effect(
    "sends a batch at most 40 at a time once its connection moves to SES, queuing the rest of it again",
    () =>
      Effect.gen(function* movedToSes() {
        const owner = yield* draftCampaign;

        yield* addContacts(
          owner,
          Arr.makeBy(FORTY_ONE, (index) => `moved-${index}@example.com`),
          [owner.list.id]
        );
        yield* owner.client.campaigns.send({ params: owner.campaignParams });
        yield* sendThroughSes(owner, Option.some(THOUSAND_A_SECOND));

        const times = yield* sendTimesOf(
          (yield* SesOutbox).sent,
          owner.campaign.subject,
          FORTY
        );

        const rest = yield* (yield* QueueInbox).takeAll;

        const sent = yield* owner.client.campaigns.get({
          params: owner.campaignParams,
        });

        assert.lengthOf(times, FORTY);
        assert.lengthOf(rest, 1);
        assert.strictEqual(sent.status, "sending");
      }).pipe(withOwnClock, Effect.scoped)
  );

  test.effect(
    "keeps an SES account to its own sending rate rather than the account's limit",
    () =>
      Effect.gen(function* ownRateOverSesLimit() {
        const owner = yield* draftCampaign;

        yield* sendThroughSes(
          owner,
          Option.some(THOUSAND_A_SECOND),
          TEN_A_MINUTE
        );
        yield* addContacts(owner, THREE_CONTACTS, [owner.list.id]);
        yield* owner.client.campaigns.send({ params: owner.campaignParams });

        const times = yield* sendTimesOf(
          (yield* SesOutbox).sent,
          owner.campaign.subject,
          THREE_CONTACTS.length
        );

        assertNoEarlierThanSlots(times, SIX_SECONDS_MS);
      }).pipe(withOwnClock, Effect.scoped)
  );

  test.effect(
    "sends an email whose slot passed while its batch was held up at once, and the next with it, then spaces them again",
    () =>
      Effect.gen(function* lateWake() {
        const owner = yield* draftCampaign;

        const { campaign, campaignParams, client, connection, list, params } =
          owner;

        yield* client.providerConnections.update({
          params: { ...params, providerConnectionId: connection.id },
          payload: {
            emailsPerMinute: TEN_A_MINUTE,
            from: connection.from,
            name: connection.name,
            smtp: { host: "smtp.example.com", port: 587, security: "starttls" },
          },
        });
        yield* addContacts(
          owner,
          [...THREE_CONTACTS, "katherine@example.com"],
          [list.id]
        );
        yield* client.campaigns.send({ params: campaignParams });

        const worker = yield* QueueWorker;
        const outbox = yield* SmtpOutbox;
        const [batch] = yield* (yield* QueueInbox).takeAll;
        const start = yield* Clock.currentTimeMillis;

        const sentAt = outbox.sent.pipe(
          Effect.map((sends) =>
            sends
              .filter((sent) => sent.email.subject === campaign.subject)
              .map((sent) => DateTime.toEpochMillis(sent.at) - start)
          )
        );

        // WARNING: the clock moves only when the test moves it, so each email is recorded at the exact time it was sent; the test waits in real time only for the batch's queries.
        const sentOnce = (count: number) =>
          Effect.promise(() => setTimeout(REAL_PAUSE_MS)).pipe(
            Effect.andThen(sentAt),
            Effect.repeat({
              times: MAX_CLOCK_TICKS,
              until: (sent) => sent.length >= count,
            })
          );

        const sending = yield* worker
          .deliver(batch ?? assert.fail())
          .pipe(Effect.forkChild);

        const beforeStall = yield* sentOnce(1);

        yield* TestClock.adjust(Duration.millis(STALL_MS));

        const afterStall = yield* sentOnce(3);

        yield* TestClock.adjust(Duration.millis(SIX_SECONDS_MS));

        const all = yield* sentOnce(4);

        yield* Fiber.join(sending);

        assert.deepStrictEqual(beforeStall, [0]);
        assert.deepStrictEqual(afterStall, [0, STALL_MS, STALL_MS]);
        assert.deepStrictEqual(all, [
          0,
          STALL_MS,
          STALL_MS,
          STALL_MS + SIX_SECONDS_MS,
        ]);
      }).pipe(withOwnClock)
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

        const finished = yield* client.campaigns.get({
          params: campaignParams,
        });

        assert.strictEqual(finished.status, "sent");
        assert.lengthOf(yield* sentTo(campaign.subject), 1);
      })
  );

  test.effect(
    "sends each Contact in a batch once, even when the batch is delivered twice at the same moment",
    () =>
      Effect.gen(function* deliveredTwiceAtOnce() {
        const owner = yield* draftCampaign;
        const { campaign, campaignParams, client, list } = owner;

        yield* addContacts(owner, THREE_CONTACTS, [list.id]);
        yield* client.campaigns.send({ params: campaignParams });

        const worker = yield* QueueWorker;
        const [message] = yield* (yield* QueueInbox).takeAll;
        const batch = message ?? assert.fail();

        yield* Effect.all(
          [
            Effect.ignore(worker.deliver(batch)),
            Effect.ignore(worker.deliver(batch)),
          ],
          { concurrency: "unbounded" }
        );
        yield* worker.deliver(batch);

        const sent = yield* client.campaigns.get({ params: campaignParams });

        assert.deepStrictEqual(yield* sentTo(campaign.subject), THREE_CONTACTS);
        assert.strictEqual(sent.status, "sent");
        assert.deepStrictEqual(
          { ...sent.recipients },
          { failed: 0, sent: 3, total: 3 }
        );
      })
  );

  test.effect(
    "never sends again to a Contact a batch reached before it was cut off, and records them as failed once that send can't still be going on",
    () =>
      Effect.gen(function* cutOffPartway() {
        const owner = yield* draftCampaign;
        const { campaign, campaignParams, client, list } = owner;

        yield* addContacts(owner, THREE_CONTACTS, [list.id]);
        yield* client.campaigns.send({ params: campaignParams });

        const worker = yield* QueueWorker;
        const [message] = yield* (yield* QueueInbox).takeAll;
        const batch = message ?? assert.fail();

        yield* (yield* SmtpOutbox).afterNextSend(
          Effect.die(new Error("The process stopped"))
        );

        const cutOff = yield* Effect.exit(worker.deliver(batch));
        const tooSoon = yield* Effect.exit(worker.deliver(batch));

        const partway = yield* client.campaigns.get({
          params: campaignParams,
        });

        yield* TestClock.adjust(Duration.minutes(3));
        yield* worker.deliver(batch);

        const done = yield* client.campaigns.get({ params: campaignParams });

        const sql = yield* SqlClient.SqlClient;

        const failures = yield* sql<{
          readonly email: string;
          readonly failure_detail: string;
        }>`
          select email, failure_detail from campaign_recipients
          where campaign_id = ${campaign.id} and status = 'failed'`;

        assert.isTrue(Exit.isFailure(cutOff));
        assert.isTrue(Exit.isFailure(tooSoon));
        assert.strictEqual(partway.status, "sending");
        assert.deepStrictEqual(
          { ...partway.recipients },
          { failed: 0, sent: 2, total: 3 }
        );
        assert.deepStrictEqual(yield* sentTo(campaign.subject), THREE_CONTACTS);
        assert.strictEqual(done.status, "sent");
        assert.deepStrictEqual(
          { ...done.recipients },
          { failed: 1, sent: 2, total: 3 }
        );
        assert.deepStrictEqual(failures, [
          {
            email: "ada@example.com",
            failure_detail:
              "Sending to them was cut off, so it may or may not have reached them. It isn't sent again, so no one gets it twice.",
          },
        ]);
      }).pipe(withOwnClock)
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
              excludedListIds: [],
              listIds: [list.id],
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
    "leaves out a Contact whose address is Suppressed while the Campaign is still sending to them",
    () =>
      Effect.gen(function* suppressedMidSend() {
        const owner = yield* draftCampaign;
        const { campaign, campaignParams, client, list, params } = owner;

        yield* addContacts(
          owner,
          ["ada@example.com", "grace@example.com"],
          [list.id]
        );
        yield* client.campaigns.send({ params: campaignParams });
        yield* client.suppressions.add({
          params,
          payload: { emails: ["grace@example.com"] },
        });
        yield* (yield* QueueWorker).deliverAll;

        const sent = yield* client.campaigns.get({ params: campaignParams });

        assert.deepStrictEqual(yield* sentTo(campaign.subject), [
          "ada@example.com",
        ]);
        assert.strictEqual(sent.status, "sent");
        assert.deepStrictEqual(
          { ...sent.recipients },
          { failed: 1, sent: 1, total: 2 }
        );
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

  test.effect(
    "schedules a draft for a date and time in a chosen time zone, and cancelling the schedule makes it a draft again",
    () =>
      Effect.gen(function* scheduleAndCancel() {
        const owner = yield* draftCampaign;
        const { campaign, campaignParams, client, connection, list } = owner;

        yield* addContacts(owner, ["ada@example.com"], [list.id]);

        const scheduled = yield* client.campaigns.schedule({
          params: campaignParams,
          payload: NINE_IN_NEW_YORK,
        });

        assert.strictEqual(scheduled.status, "scheduled");
        assert.deepStrictEqual(
          { ...scheduled.schedule },
          {
            at: NINE_IN_NEW_YORK_UTC,
            missed: null,
            timeZone: "America/New_York",
          }
        );
        assert.deepStrictEqual(
          yield* client.campaigns.get({ params: campaignParams }),
          scheduled
        );

        const edited = yield* client.campaigns
          .update({
            params: campaignParams,
            payload: {
              ...CONTENT,
              excludedListIds: [],
              listIds: [list.id],
              providerConnectionId: connection.id,
            },
          })
          .pipe(Effect.flip);

        const sentNow = yield* client.campaigns
          .send({ params: campaignParams })
          .pipe(Effect.flip);

        assert.strictEqual(edited._tag, "CampaignNotDraft");
        assert.strictEqual(sentNow._tag, "CampaignNotDraft");

        const cancelled = yield* client.campaigns.cancelSchedule({
          params: campaignParams,
        });

        assert.strictEqual(cancelled.status, "draft");
        assert.isNull(cancelled.schedule);
        assert.strictEqual(cancelled.subject, campaign.subject);

        yield* setClock(NINE_IN_NEW_YORK_UTC);
        yield* (yield* QueueWorker).deliverAll;

        const after = yield* client.campaigns.get({ params: campaignParams });

        assert.strictEqual(after.status, "draft");
        assert.isEmpty(yield* sentTo(campaign.subject));
      }).pipe(withOwnClock)
  );

  test.effect(
    "starts sending a scheduled Campaign when its time comes, not before, and only at the time it was last moved to",
    () =>
      Effect.gen(function* startWhenDue() {
        const owner = yield* draftCampaign;
        const { campaign, campaignParams, client, list } = owner;
        const worker = yield* QueueWorker;

        yield* addContacts(
          owner,
          ["ada@example.com", "grace@example.com"],
          [list.id]
        );
        yield* client.campaigns.schedule({
          params: campaignParams,
          payload: NINE_IN_NEW_YORK,
        });

        const moved = yield* client.campaigns.schedule({
          params: campaignParams,
          payload: { ...NINE_IN_NEW_YORK, localDateTime: "2099-12-01T10:00" },
        });

        const tenInNewYork = DateTime.makeUnsafe("2099-12-01T15:00:00Z");

        assert.strictEqual(moved.status, "scheduled");
        assert.deepStrictEqual(moved.schedule?.at, tenInNewYork);

        yield* setClock(NINE_IN_NEW_YORK_UTC);
        yield* worker.deliverAll;

        const stillScheduled = yield* client.campaigns.get({
          params: campaignParams,
        });

        assert.strictEqual(stillScheduled.status, "scheduled");
        assert.isEmpty(yield* sentTo(campaign.subject));

        yield* setClock(DateTime.subtract(tenInNewYork, { milliseconds: 1 }));
        yield* worker.deliverAll;

        assert.strictEqual(
          (yield* client.campaigns.get({ params: campaignParams })).status,
          "scheduled"
        );

        yield* setClock(tenInNewYork);
        yield* worker.deliverAll;

        const sent = yield* client.campaigns.get({ params: campaignParams });

        assert.strictEqual(sent.status, "sent");
        assert.isNotNull(sent.sendingStartedAt);
        assert.deepStrictEqual(
          { ...sent.schedule },
          { at: tenInNewYork, missed: null, timeZone: "America/New_York" }
        );
        assert.deepStrictEqual(
          { ...sent.recipients },
          { failed: 0, sent: 2, total: 2 }
        );
        assert.deepStrictEqual(yield* sentTo(campaign.subject), [
          "ada@example.com",
          "grace@example.com",
        ]);
      }).pipe(withOwnClock)
  );

  test.effect(
    "makes a scheduled Campaign that can't start when it's due a draft again, saying why, until its schedule is cleared",
    () =>
      Effect.gen(function* missedSchedule() {
        const nobody = yield* draftCampaign;
        const noConnection = yield* draftCampaign;

        const [leaving] = yield* addContacts(
          nobody,
          ["leaving@example.com"],
          [nobody.list.id]
        );

        yield* addContacts(
          noConnection,
          ["ada@example.com"],
          [noConnection.list.id]
        );

        for (const owner of [nobody, noConnection]) {
          yield* owner.client.campaigns.schedule({
            params: owner.campaignParams,
            payload: NINE_IN_NEW_YORK,
          });
        }

        yield* setStatus(leaving?.id ?? assert.fail(), "unsubscribed");
        yield* noConnection.client.providerConnections.delete({
          params: {
            ...noConnection.params,
            providerConnectionId: noConnection.connection.id,
          },
        });

        yield* setClock(NINE_IN_NEW_YORK_UTC);
        yield* (yield* QueueWorker).deliverAll;

        const missed = yield* Effect.forEach([nobody, noConnection], (owner) =>
          owner.client.campaigns.get({ params: owner.campaignParams })
        );

        assert.deepStrictEqual(
          missed.map((campaign) => [campaign.status, { ...campaign.schedule }]),
          [
            [
              "draft",
              {
                at: NINE_IN_NEW_YORK_UTC,
                missed: "no-subscribed-contacts",
                timeZone: "America/New_York",
              },
            ],
            [
              "draft",
              {
                at: NINE_IN_NEW_YORK_UTC,
                missed: "no-provider-connection",
                timeZone: "America/New_York",
              },
            ],
          ]
        );
        assert.isEmpty(yield* sentTo(nobody.campaign.subject));
        assert.isEmpty(yield* sentTo(noConnection.campaign.subject));

        const cleared = yield* nobody.client.campaigns.cancelSchedule({
          params: nobody.campaignParams,
        });

        assert.strictEqual(cleared.status, "draft");
        assert.isNull(cleared.schedule);
      }).pipe(withOwnClock)
  );

  test.effect(
    "schedules a time the clocks skip, when daylight saving starts, that much later",
    () =>
      Effect.gen(function* clocksSkip() {
        const owner = yield* draftCampaign;
        const { campaignParams, client, list } = owner;

        yield* addContacts(owner, ["ada@example.com"], [list.id]);

        const halfPastTwoWhenNewYorkSkipsFromTwoToThree = {
          localDateTime: "2099-03-08T02:30",
          timeZone: "America/New_York",
        };

        const scheduled = yield* client.campaigns.schedule({
          params: campaignParams,
          payload: halfPastTwoWhenNewYorkSkipsFromTwoToThree,
        });

        const halfPastThreeEdt = DateTime.makeUnsafe("2099-03-08T07:30:00Z");

        assert.deepStrictEqual(scheduled.schedule?.at, halfPastThreeEdt);
      })
  );

  test.effect(
    "refuses to schedule a Campaign for a time that has passed, or for a date or time zone that doesn't exist, and leaves it a draft",
    () =>
      Effect.gen(function* badTimes() {
        const cookie = yield* signedInPerson;
        const client = yield* clientWithCookie(cookie);

        const organization = yield* client.organizations.create({
          payload: { name: "Acme" },
        });

        const params = { organizationId: organization.id };

        yield* client.organizations.updatePostalAddress({
          params,
          payload: { postalAddress: POSTAL_ADDRESS },
        });

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

        yield* client.contacts.create({
          params,
          payload: { email: "ada@example.com", listIds: [list.id] },
        });

        const campaign = yield* client.campaigns.create({
          params,
          payload: {
            ...CONTENT,
            excludedListIds: [],
            listIds: [list.id],
            providerConnectionId: connection.id,
          },
        });

        const campaignParams = { ...params, campaignId: campaign.id };

        const past = yield* client.campaigns
          .schedule({
            params: campaignParams,
            payload: { localDateTime: "2020-01-01T09:00", timeZone: "UTC" },
          })
          .pipe(Effect.flip);

        const path = `/api/organizations/${organization.id}/campaigns/${campaign.id}/schedule`;

        const refused = yield* Effect.forEach(
          [
            { localDateTime: "2099-02-30T09:00", timeZone: "UTC" },
            { localDateTime: "2099-12-01T24:00", timeZone: "UTC" },
            {
              localDateTime: "2099-12-01T09:00",
              timeZone: "Mars/Olympus_Mons",
            },
          ],
          (body) => request("PUT", path, { body, headers: { cookie } })
        );

        assert.strictEqual(past._tag, "ScheduleInPast");
        assert.deepStrictEqual(
          refused.map((response) => response.status),
          [400, 400, 400]
        );
        assert.strictEqual(
          (yield* client.campaigns.get({ params: campaignParams })).status,
          "draft"
        );
      })
  );

  test.effect(
    "refuses to schedule a Campaign that sending now would refuse, and to schedule or cancel one that started sending",
    () =>
      Effect.gen(function* refusedLikeSending() {
        const nobody = yield* draftCampaign;
        const noAddress = yield* draftCampaignIn(null);
        const started = yield* draftCampaign;

        yield* addContacts(noAddress, ["ada@example.com"], [noAddress.list.id]);
        yield* addContacts(started, ["ada@example.com"], [started.list.id]);
        yield* started.client.campaigns.send({
          params: started.campaignParams,
        });

        const refusals = yield* Effect.forEach(
          [nobody, noAddress, started],
          (owner) =>
            owner.client.campaigns
              .schedule({
                params: owner.campaignParams,
                payload: NINE_IN_NEW_YORK,
              })
              .pipe(Effect.flip)
        );

        const cancelStarted = yield* started.client.campaigns
          .cancelSchedule({ params: started.campaignParams })
          .pipe(Effect.flip);

        const noCampaign = yield* nobody.client.campaigns
          .schedule({
            params: { ...nobody.params, campaignId: NO_SUCH_CAMPAIGN },
            payload: NINE_IN_NEW_YORK,
          })
          .pipe(Effect.flip);

        assert.deepStrictEqual(
          refusals.map((refusal) => refusal._tag),
          ["NoSubscribedContacts", "PostalAddressRequired", "CampaignNotDraft"]
        );
        assert.strictEqual(cancelStarted._tag, "CampaignNotDraft");
        assert.strictEqual(noCampaign._tag, "CampaignNotFound");

        const after = yield* Effect.forEach([nobody, noAddress], (owner) =>
          owner.client.campaigns.get({ params: owner.campaignParams })
        );

        assert.deepStrictEqual(
          after.map((campaign) => [campaign.status, campaign.schedule]),
          [
            ["draft", null],
            ["draft", null],
          ]
        );

        yield* setClock(NINE_IN_NEW_YORK_UTC);

        const handled = yield* (yield* QueueWorker).deliverAll;

        const refusedIds = new Set<string>(
          [nobody, noAddress, started].map((owner) => owner.campaign.id)
        );

        assert.isEmpty(
          handled.filter(
            (message) =>
              message._tag === "StartScheduledCampaign" &&
              refusedIds.has(message.campaignId)
          )
        );
      }).pipe(withOwnClock)
  );
});
