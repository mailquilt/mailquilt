import { assert, layer } from "@effect/vitest";
import { SesOutbox } from "@repo/core/testing";
import type { SuppressionReason } from "@repo/domain";
import { sesBounce, sesComplaint } from "@repo/providers/testing";
import type { UnsignedSnsMessage } from "@repo/providers/testing";
import { Effect, pipe, Redacted } from "effect";
import { SqlClient } from "effect/sql";
import { TestClock } from "effect/testing";

import { ownOrganization } from "./accounts.ts";
import type { Owner } from "./campaign-emails.ts";
import { newList } from "./campaign-emails.ts";
import {
  APP_URL,
  AppFetch,
  QueueWorker,
  SnsSigner,
  TestApp,
} from "./harness.ts";

const SES_ACCOUNT = {
  credentials: {
    accessKeyId: Redacted.make("AKIAIOSFODNN7EXAMPLE"),
    secretAccessKey: Redacted.make("wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"),
  },
  // WARNING: each email through SES waits for its send slot (ADR 0018), on the live clock here, so the fastest rate keeps the tests quick.
  emailsPerMinute: 60_000,
  from: { email: "hello@acme.example" },
  name: "Amazon SES",
  provider: "ses",
  ses: { region: "eu-west-1" },
} as const;

let snsMessages = 0;

const nextSnsMessageId = () => {
  snsMessages += 1;

  return `00000000-0000-4000-8000-${String(snsMessages).padStart(12, "0")}`;
};

const notification = (message: string, timestamp = new Date()) =>
  ({
    Message: message,
    MessageId: nextSnsMessageId(),
    Timestamp: timestamp.toISOString(),
    Type: "Notification",
  }) satisfies UnsignedSnsMessage;

const sesOrganization = Effect.gen(function* sesOrganization() {
  const owner = yield* ownOrganization;
  const { client, params } = owner;

  const connection = yield* client.providerConnections.create({
    params,
    payload: SES_ACCOUNT,
  });

  const list = yield* newList(owner, "Newsletter");

  yield* client.organizations.updatePostalAddress({
    params,
    payload: { postalAddress: "14 Mill Lane\nBristol BS1 4XE" },
  });

  const { url } = yield* client.providerConnections.sesNotificationsUrl({
    params: { ...params, providerConnectionId: connection.id },
  });

  return { ...owner, connectionId: connection.id, listId: list.id, url };
});

type SesOrganization = Effect.Success<typeof sesOrganization>;

const sendThroughSes = (owner: SesOrganization, emails: readonly string[]) =>
  Effect.gen(function* sendCampaign() {
    const { client, params } = owner;

    yield* pipe(
      emails,
      Effect.forEach((email) =>
        client.contacts
          .create({ params, payload: { email, listIds: [owner.listId] } })
          .pipe(Effect.ignore)
      )
    );

    const subject = `SES ${nextSnsMessageId()}`;

    const campaign = yield* client.campaigns.create({
      params,
      payload: {
        excludedListIds: [],
        from: { email: "news@acme.example" },
        html: "<p>Hello!</p>",
        listIds: [owner.listId],
        providerConnectionId: owner.connectionId,
        subject,
      },
    });

    yield* client.campaigns.send({
      params: { ...params, campaignId: campaign.id },
    });
    // WARNING: the suite's test clock is frozen, so a batch waiting for a send slot on it would never send its second email.
    yield* TestClock.withLive((yield* QueueWorker).deliverAll);

    // WARNING: the recording SES Provider numbers every email it's sent in the test app, `ses-1` onwards.
    const messageIds = new Map(
      (yield* (yield* SesOutbox).sent).flatMap(({ email }, index) =>
        email.subject === subject
          ? [[email.to, `ses-${index + 1}`] as const]
          : []
      )
    );

    return {
      campaignId: campaign.id,
      messageIdOf: (email: string) => messageIds.get(email) ?? "not sent",
    };
  });

const postSigned = (url: string, message: UnsignedSnsMessage) =>
  Effect.gen(function* post() {
    const signer = yield* SnsSigner;

    return yield* postBody(url, JSON.stringify(signer.sign(message)));
  });

const postBody = (url: string, body: string) =>
  Effect.gen(function* post() {
    const fetch = yield* AppFetch;

    const response = yield* Effect.promise(() =>
      fetch(url, {
        body,
        headers: {
          "content-type": "text/plain; charset=UTF-8",
          "x-amz-sns-message-type": "Notification",
        },
        method: "POST",
      })
    );

    return response.status;
  });

const DAY_MS = 86_400_000;

const EIGHT_DAYS_AGO = new Date(Date.now() - 8 * DAY_MS);

// WARNING: delivery events have partitions only from the month the database was made, so an event moved into an earlier month needs one made for it.
const partitionFor = (date: Date) =>
  Effect.gen(function* partition() {
    const sql = yield* SqlClient.SqlClient;
    const month = date.toISOString().slice(0, 7);

    yield* sql.unsafe(`
      create table if not exists delivery_events_${month.replace("-", "_")}
      partition of delivery_events
      for values from ('${month}-01 00:00:00+00') to ('${month}-01 00:00:00+00'::timestamptz + interval '1 month')
    `);
  });

const suppressionsOf = ({ client, params }: Owner) =>
  client.suppressions
    .list({ params, query: {} })
    .pipe(
      Effect.map((page) =>
        page.suppressions.map(
          ({ email, reason }) =>
            [email, reason] satisfies readonly [string, SuppressionReason]
        )
      )
    );

layer(TestApp, { timeout: "2 minutes" })(
  "SES bounces and complaints",
  (test) => {
    test.effect(
      "gives an SES connection a notifications URL, and an SMTP one none",
      () =>
        Effect.gen(function* notificationsUrl() {
          const owner = yield* sesOrganization;
          const { client, params } = owner;

          const smtp = yield* client.providerConnections.create({
            params,
            payload: {
              from: { email: "hello@acme.example" },
              name: "Postmark",
              smtp: {
                host: "smtp.example.com",
                port: 587,
                security: "starttls",
              },
            },
          });

          const refused = yield* client.providerConnections
            .sesNotificationsUrl({
              params: { ...params, providerConnectionId: smtp.id },
            })
            .pipe(Effect.flip);

          assert.match(
            owner.url,
            /^http:\/\/mailquilt\.test\/api\/webhooks\/ses\?token=[\w.-]+$/u
          );
          assert.strictEqual(refused._tag, "ProviderConnectionNotFound");
        })
    );

    test.effect(
      "confirms the SNS subscription a notifications URL is given",
      () =>
        Effect.gen(function* confirm() {
          const { url } = yield* sesOrganization;
          const signer = yield* SnsSigner;

          const subscribeUrl = `https://sns.eu-west-1.amazonaws.com/?Action=ConfirmSubscription&Token=${nextSnsMessageId()}`;

          const status = yield* postSigned(url, {
            Message: "You have chosen to subscribe to the topic.",
            MessageId: nextSnsMessageId(),
            SubscribeURL: subscribeUrl,
            Timestamp: new Date().toISOString(),
            Token: "2336412f37",
            Type: "SubscriptionConfirmation",
          });

          assert.strictEqual(status, 200);
          assert.include(signer.fetched, subscribeUrl);
        })
    );

    test.effect(
      "Suppresses an address at once when it hard bounces or complains, and records each",
      () =>
        Effect.gen(function* hardBounceAndComplaint() {
          const owner = yield* sesOrganization;
          const sql = yield* SqlClient.SqlClient;

          const sent = yield* sendThroughSes(owner, [
            "gone@example.com",
            "angry@example.com",
            "fine@example.com",
          ]);

          const bounced = yield* postSigned(
            owner.url,
            notification(
              sesBounce(sent.messageIdOf("gone@example.com"), "Permanent")
            )
          );

          const complained = yield* postSigned(
            owner.url,
            notification(sesComplaint(sent.messageIdOf("angry@example.com")))
          );

          const events = yield* sql<{
            kind: string;
            provider_message_id: string;
          }>`
        select kind, provider_message_id from delivery_events
        where campaign_id = ${sent.campaignId} and kind <> 'sent'
        order by kind
      `;

          assert.deepStrictEqual([bounced, complained], [200, 200]);
          assert.sameDeepMembers(
            [...(yield* suppressionsOf(owner))],
            [
              ["gone@example.com", "hard-bounce"],
              ["angry@example.com", "complaint"],
            ]
          );
          assert.deepStrictEqual(
            events.map((event) => [event.kind, event.provider_message_id]),
            [
              ["bounced", sent.messageIdOf("gone@example.com")],
              ["complained", sent.messageIdOf("angry@example.com")],
            ]
          );
        })
    );

    test.effect(
      "Suppresses an address on its third soft bounce within 7 days, not before",
      () =>
        Effect.gen(function* softBounces() {
          const owner = yield* sesOrganization;
          const sql = yield* SqlClient.SqlClient;

          const softBounce = (messageId: string) =>
            postSigned(
              owner.url,
              notification(sesBounce(messageId, "Transient"))
            );

          const first = yield* sendThroughSes(owner, ["full@example.com"]);
          const second = yield* sendThroughSes(owner, ["full@example.com"]);
          const third = yield* sendThroughSes(owner, ["full@example.com"]);
          const fourth = yield* sendThroughSes(owner, ["full@example.com"]);

          yield* softBounce(first.messageIdOf("full@example.com"));
          yield* partitionFor(EIGHT_DAYS_AGO);
          yield* sql`
        update delivery_events set occurred_at = ${EIGHT_DAYS_AGO}
        where campaign_id = ${first.campaignId} and kind = 'soft-bounced'
      `;

          yield* softBounce(second.messageIdOf("full@example.com"));
          yield* softBounce(third.messageIdOf("full@example.com"));

          const afterTwoInAWeek = yield* suppressionsOf(owner);

          yield* softBounce(fourth.messageIdOf("full@example.com"));

          assert.deepStrictEqual(afterTwoInAWeek, []);
          assert.deepStrictEqual(yield* suppressionsOf(owner), [
            ["full@example.com", "soft-bounce"],
          ]);
        })
    );

    test.effect("records a message SNS sends twice only once", () =>
      Effect.gen(function* replayed() {
        const owner = yield* sesOrganization;
        const sql = yield* SqlClient.SqlClient;
        const sent = yield* sendThroughSes(owner, ["full@example.com"]);

        const message = notification(
          sesBounce(sent.messageIdOf("full@example.com"), "Transient")
        );

        const statuses = [
          yield* postSigned(owner.url, message),
          yield* postSigned(owner.url, message),
        ];

        const events = yield* sql`
        select 1 from delivery_events where campaign_id = ${sent.campaignId} and kind = 'soft-bounced'
      `;

        assert.deepStrictEqual(statuses, [200, 200]);
        assert.strictEqual(events.length, 1);
      })
    );

    test.effect(
      "records an email's bounce once, however many SNS messages report it",
      () =>
        Effect.gen(function* reportedTwice() {
          const owner = yield* sesOrganization;
          const sql = yield* SqlClient.SqlClient;
          const sent = yield* sendThroughSes(owner, ["full@example.com"]);

          const bounce = sesBounce(
            sent.messageIdOf("full@example.com"),
            "Transient"
          );

          yield* postSigned(owner.url, notification(bounce));
          yield* postSigned(owner.url, notification(bounce));

          const events = yield* sql`
          select 1 from delivery_events where campaign_id = ${sent.campaignId} and kind = 'soft-bounced'
        `;

          assert.strictEqual(events.length, 1);
        })
    );

    test.effect("refuses a message larger than SNS sends", () =>
      Effect.gen(function* tooLarge() {
        const { url } = yield* sesOrganization;
        const status = yield* postBody(url, "x".repeat(257 * 1024));

        assert.strictEqual(status, 413);
      })
    );

    test.effect("refuses a message SNS sent more than an hour ago", () =>
      Effect.gen(function* stale() {
        const owner = yield* sesOrganization;
        const sent = yield* sendThroughSes(owner, ["gone@example.com"]);
        const twoHoursAgo = new Date(Date.now() - 2 * 3_600_000);

        const status = yield* postSigned(
          owner.url,
          notification(
            sesBounce(sent.messageIdOf("gone@example.com"), "Permanent"),
            twoHoursAgo
          )
        );

        assert.strictEqual(status, 403);
        assert.deepStrictEqual(yield* suppressionsOf(owner), []);
      })
    );

    test.effect("refuses a message SNS didn't sign", () =>
      Effect.gen(function* forged() {
        const owner = yield* sesOrganization;
        const signer = yield* SnsSigner;
        const sent = yield* sendThroughSes(owner, ["gone@example.com"]);

        const signed = signer.sign(
          notification(sesBounce("ses-0", "Permanent"))
        );

        const status = yield* postBody(
          owner.url,
          JSON.stringify({
            ...signed,
            Message: sesBounce(
              sent.messageIdOf("gone@example.com"),
              "Permanent"
            ),
          })
        );

        assert.strictEqual(status, 403);
        assert.deepStrictEqual(yield* suppressionsOf(owner), []);
      })
    );

    test.effect(
      "answers 404 to a URL whose token isn't one this install signed for SES notifications",
      () =>
        Effect.gen(function* badToken() {
          const owner = yield* sesOrganization;
          const sent = yield* sendThroughSes(owner, ["gone@example.com"]);
          const [, token = ""] = owner.url.split("token=");
          const [version, body, tag = ""] = token.split(".");
          const changed = `${version}.${body}.${tag.startsWith("A") ? "B" : "A"}${tag.slice(1)}`;

          const message = () =>
            notification(
              sesBounce(sent.messageIdOf("gone@example.com"), "Permanent")
            );

          const statuses = [
            yield* postSigned(
              `${APP_URL}/api/webhooks/ses?token=${changed}`,
              message()
            ),
            yield* postSigned(`${APP_URL}/api/webhooks/ses`, message()),
          ];

          assert.deepStrictEqual(statuses, [404, 404]);
          assert.deepStrictEqual(yield* suppressionsOf(owner), []);
        })
    );

    test.effect("answers 404 once the connection is deleted", () =>
      Effect.gen(function* deleted() {
        const owner = yield* sesOrganization;
        const { client, params } = owner;
        const sent = yield* sendThroughSes(owner, ["gone@example.com"]);

        yield* client.providerConnections.delete({
          params: { ...params, providerConnectionId: owner.connectionId },
        });

        const status = yield* postSigned(
          owner.url,
          notification(
            sesBounce(sent.messageIdOf("gone@example.com"), "Permanent")
          )
        );

        assert.strictEqual(status, 404);
        assert.deepStrictEqual(yield* suppressionsOf(owner), []);
      })
    );

    test.effect(
      "ignores feedback about an email its Organization didn't send",
      () =>
        Effect.gen(function* anotherOrganizationsEmail() {
          const victim = yield* sesOrganization;
          const other = yield* sesOrganization;
          const sent = yield* sendThroughSes(victim, ["gone@example.com"]);

          const status = yield* postSigned(
            other.url,
            notification(
              sesBounce(sent.messageIdOf("gone@example.com"), "Permanent")
            )
          );

          assert.strictEqual(status, 200);
          assert.deepStrictEqual(yield* suppressionsOf(victim), []);
          assert.deepStrictEqual(yield* suppressionsOf(other), []);
        })
    );
  }
);
