import { assert, layer } from "@effect/vitest";
import type { ListId, ProviderConnectionId } from "@repo/domain";
import {
  AUTO_REPLY,
  deliveryStatusReport,
} from "@repo/providers/testing/bounces";
import { Effect, pipe } from "effect";
import { SqlClient } from "effect/sql";

import { ownOrganization } from "./accounts.ts";
import type { Owner } from "./campaign-emails.ts";
import { newList, sentWith } from "./campaign-emails.ts";
import { BOUNCE_DOMAIN, BounceInbox, QueueWorker, TestApp } from "./harness.ts";
import { addReadySendingDomain } from "./ready-sending-domain.ts";

const SERVER = {
  from: { email: "hello@acme.example" },
  name: "Fernhill relay",
  smtp: { host: "smtp.example.com", port: 587, security: "starttls" },
} as const;

const HARD_BOUNCE = deliveryStatusReport({ action: "failed", status: "5.1.1" });

const SOFT_BOUNCE = deliveryStatusReport({
  action: "failed",
  recipient: "full@example.com",
  status: "4.4.7",
});

let campaigns = 0;

const smtpOrganization = (usesBounceAddress: boolean) =>
  Effect.gen(function* organizationWithSmtp() {
    const owner = yield* ownOrganization;
    const { client, params } = owner;

    const connection = yield* client.providerConnections.create({
      params,
      payload: { ...SERVER, usesBounceAddress },
    });

    const list = yield* newList(owner, "Newsletter");

    yield* client.organizations.updatePostalAddress({
      params,
      payload: { postalAddress: "14 Mill Lane\nBristol BS1 4XE" },
    });
    yield* addReadySendingDomain(owner);

    return { ...owner, connectionId: connection.id, listId: list.id };
  });

const sendTo = (
  owner: Owner & {
    readonly connectionId: ProviderConnectionId;
    readonly listId: ListId;
  },
  emails: readonly string[]
) =>
  Effect.gen(function* sendCampaign() {
    const { client, params } = owner;

    campaigns += 1;

    yield* pipe(
      emails,
      Effect.forEach((email) =>
        client.contacts.create({
          params,
          payload: { email, listIds: [owner.listId] },
        })
      )
    );

    const subject = `Autumn menu #${campaigns}`;

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
    yield* (yield* QueueWorker).deliverAll;

    const sent = yield* sentWith(subject);

    return {
      bounceAddressOf: (email: string) =>
        sent.find((each) => each.to === email)?.bounceAddress ?? "none",
      campaignId: campaign.id,
      sent,
    };
  });

const suppressionsOf = ({ client, params }: Owner) =>
  client.suppressions
    .list({ params, query: {} })
    .pipe(
      Effect.map((page) =>
        page.suppressions.map(({ email, reason }) => [email, reason] as const)
      )
    );

const BOUNCE_ADDRESS = new RegExp(
  `^[0-9a-z]{78}-1-[0-9a-z]{16}@${BOUNCE_DOMAIN.replaceAll(".", "\\.")}$`,
  "u"
);

layer(TestApp, { timeout: "2 minutes" })("Bounce addresses", (test) => {
  test.effect(
    "keeps an SMTP connection's bounce address off until a member turns it on, and an edit that leaves it out keeps it",
    () =>
      Effect.gen(function* setting() {
        const { client, params } = yield* ownOrganization;

        const created = yield* client.providerConnections.create({
          params,
          payload: SERVER,
        });

        const connection = { ...params, providerConnectionId: created.id };

        const turnedOn = yield* client.providerConnections.update({
          params: connection,
          payload: { ...SERVER, usesBounceAddress: true },
        });

        const kept = yield* client.providerConnections.update({
          params: connection,
          payload: SERVER,
        });

        assert.deepStrictEqual(
          [created, turnedOn, kept].map((each) =>
            each.provider === "smtp" ? each.usesBounceAddress : "not smtp"
          ),
          [false, true, true]
        );
      })
  );

  test.effect(
    "sends each email from its own signed bounce address only through a connection that uses one",
    () =>
      Effect.gen(function* envelope() {
        const on = yield* sendTo(yield* smtpOrganization(true), [
          "ada@example.com",
          "lin@example.com",
        ]);

        const off = yield* sendTo(yield* smtpOrganization(false), [
          "ada@example.com",
        ]);

        const [ada, lin] = [
          on.bounceAddressOf("ada@example.com"),
          on.bounceAddressOf("lin@example.com"),
        ];

        assert.match(ada, BOUNCE_ADDRESS);
        assert.match(lin, BOUNCE_ADDRESS);
        assert.notStrictEqual(ada, lin);
        assert.strictEqual(off.bounceAddressOf("ada@example.com"), "none");
      })
  );

  test.effect(
    "records a hard bounce to a bounce address once and Suppresses the address, and a soft one without",
    () =>
      Effect.gen(function* bounces() {
        const owner = yield* smtpOrganization(true);
        const inbox = yield* BounceInbox;
        const sql = yield* SqlClient.SqlClient;

        const sent = yield* sendTo(owner, [
          "gone@example.com",
          "full@example.com",
        ]);

        const gone = sent.bounceAddressOf("gone@example.com");

        const outcomes = [
          yield* inbox.receive(gone, HARD_BOUNCE),
          yield* inbox.receive(gone.toUpperCase(), HARD_BOUNCE),
          yield* inbox.receive(
            sent.bounceAddressOf("full@example.com"),
            SOFT_BOUNCE
          ),
        ];

        const events = yield* sql<{ kind: string; email: string }>`
          select e.kind, r.email from delivery_events e
          join campaign_recipients r on r.campaign_id = e.campaign_id and r.contact_id = e.contact_id
          where e.campaign_id = ${sent.campaignId} and e.kind <> 'sent'
          order by e.kind
        `;

        assert.deepStrictEqual(outcomes, ["bounce", "bounce", "bounce"]);
        assert.deepStrictEqual(
          events.map((event) => [event.kind, event.email]),
          [
            ["bounced", "gone@example.com"],
            ["soft-bounced", "full@example.com"],
          ]
        );
        assert.deepStrictEqual(yield* suppressionsOf(owner), [
          ["gone@example.com", "hard-bounce"],
        ]);
      })
  );

  test.effect(
    "ignores an email to an address this install didn't sign, and one that isn't a bounce",
    () =>
      Effect.gen(function* ignored() {
        const owner = yield* smtpOrganization(true);
        const inbox = yield* BounceInbox;
        const sent = yield* sendTo(owner, ["gone@example.com"]);
        const address = sent.bounceAddressOf("gone@example.com");
        const [local = "", domain = ""] = address.split("@");
        const lastCharacter = local.endsWith("a") ? "b" : "a";

        const outcomes = [
          yield* inbox.receive(
            `${local.slice(0, -1)}${lastCharacter}@${domain}`,
            HARD_BOUNCE
          ),
          yield* inbox.receive(`${local}@elsewhere.example`, HARD_BOUNCE),
          yield* inbox.receive(`postmaster@${domain}`, HARD_BOUNCE),
          yield* inbox.receive(address, AUTO_REPLY),
        ];

        assert.deepStrictEqual(outcomes, [
          "not-signed",
          "not-signed",
          "not-signed",
          "not-a-bounce",
        ]);
        assert.deepStrictEqual(yield* suppressionsOf(owner), []);
      })
  );

  test.effect(
    "ignores a bounce about another address than the email went to, such as one member of an alias",
    () =>
      Effect.gen(function* aliasMember() {
        const owner = yield* smtpOrganization(true);
        const inbox = yield* BounceInbox;
        const sent = yield* sendTo(owner, ["team@example.com"]);

        const outcome = yield* inbox.receive(
          sent.bounceAddressOf("team@example.com"),
          deliveryStatusReport({
            action: "failed",
            originalRecipient: "team@example.com",
            recipient: "bob@example.com",
            status: "5.1.1",
          })
        );

        assert.strictEqual(outcome, "not-its-address");
        assert.deepStrictEqual(yield* suppressionsOf(owner), []);
      })
  );

  test.effect(
    "records a bounce about an email whose send was cut off, which has no message ID",
    () =>
      Effect.gen(function* cutOff() {
        const owner = yield* smtpOrganization(true);
        const inbox = yield* BounceInbox;
        const sql = yield* SqlClient.SqlClient;
        const sent = yield* sendTo(owner, ["gone@example.com"]);

        // WARNING: no endpoint can cut a send off; this is the state a delivery that stopped mid-send leaves once the next one records the recipient failed.
        yield* sql`
          update campaign_recipients set status = 'failed', provider_message_id = null
          where campaign_id = ${sent.campaignId}
        `;

        yield* inbox.receive(
          sent.bounceAddressOf("gone@example.com"),
          HARD_BOUNCE
        );

        assert.deepStrictEqual(yield* suppressionsOf(owner), [
          ["gone@example.com", "hard-bounce"],
        ]);
      })
  );
});
