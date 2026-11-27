import { assert, layer } from "@effect/vitest";
import { DnsZone, QueueInbox, SmtpOutbox, txtRecord } from "@repo/core/testing";
import {
  DnsLookupFailed,
  SendingDomainIdSchema,
  SendingDomainNotReady,
  SendingDomainRequired,
} from "@repo/domain";
import { DateTime, Effect, Exit, pipe } from "effect";
import { TestClock } from "effect/testing";

import {
  clientWithCookie,
  ownOrganization,
  send,
  signedInPerson,
} from "./accounts.ts";
import { QueueWorker, TestApp } from "./harness.ts";
import {
  addReadySendingDomain,
  DKIM_KEY,
  READY_SELECTOR,
  readyDomainRecords,
} from "./ready-sending-domain.ts";

type Owner = Effect.Success<typeof ownOrganization>;

const SENDING_DOMAIN_ID = /^sdm_[0-7][0-9a-hjkmnp-tv-z]{25}$/u;

const NO_SUCH_SENDING_DOMAIN = SendingDomainIdSchema.make(
  "sdm_00000000000000000000000000"
);

const NINE_IN_LONDON = {
  localDateTime: "2099-12-01T09:00",
  timeZone: "Europe/London",
} as const;

const NINE_IN_LONDON_UTC = DateTime.makeUnsafe("2099-12-01T09:00:00Z");

let domains = 0;

const uniqueDomain = (name: string) => {
  domains += 1;

  return `${name}-${domains}.example`;
};

const draftFrom = (owner: Owner, domain: string) =>
  Effect.gen(function* draftCampaign() {
    const { client, params } = owner;

    yield* client.organizations.updatePostalAddress({
      params,
      payload: { postalAddress: "14 Mill Lane\nBristol BS1 4XE" },
    });

    const list = yield* client.lists.create({
      params,
      payload: { name: "Weekly news" },
    });

    yield* client.contacts.create({
      params,
      payload: { email: "ada@example.com", listIds: [list.id] },
    });

    const connection = yield* client.providerConnections.create({
      params,
      payload: {
        from: { email: `hello@${domain}` },
        name: "Postmark",
        smtp: { host: "smtp.example.com", port: 587, security: "starttls" },
      },
    });

    const campaign = yield* client.campaigns.create({
      params,
      payload: {
        excludedListIds: [],
        from: { email: `news@${domain}` },
        html: "<p>Hello!</p>",
        listIds: [list.id],
        providerConnectionId: connection.id,
        subject: `News from ${domain}`,
      },
    });

    return { ...params, campaignId: campaign.id };
  });

const sentFrom = (domain: string) =>
  Effect.gen(function* sentEmails() {
    const outbox = yield* SmtpOutbox;

    return (yield* outbox.sent).filter(
      (sent) => sent.email.subject === `News from ${domain}`
    );
  });

const withOwnClock = Effect.provide(TestClock.layer());

layer(TestApp, { timeout: "2 minutes" })("Sending Domains", (test) => {
  test.effect(
    "adds a Sending Domain, lowercased, unchecked until it's checked, and lists it",
    () =>
      Effect.gen(function* addDomain() {
        const owner = yield* ownOrganization;
        const { client, params } = owner;

        const added = yield* client.sendingDomains.create({
          params,
          payload: {
            dkimSelectors: ["S1", "s2"],
            domain: "Mail.Acme.Example",
            returnPath: "Bounce.Mail.Acme.Example",
          },
        });

        const second = yield* client.sendingDomains.create({
          params,
          payload: { dkimSelectors: ["s1"], domain: "acme.example" },
        });

        const listed = yield* client.sendingDomains.list({ params });

        const read = yield* client.sendingDomains.get({
          params: { ...params, sendingDomainId: added.id },
        });

        assert.match(added.id, SENDING_DOMAIN_ID);
        assert.deepStrictEqual(
          {
            check: added.check,
            dkimSelectors: added.dkimSelectors,
            domain: added.domain,
            returnPath: added.returnPath,
          },
          {
            check: null,
            dkimSelectors: ["s1", "s2"],
            domain: "mail.acme.example",
            returnPath: "bounce.mail.acme.example",
          }
        );
        assert.strictEqual(second.returnPath, null);
        assert.deepStrictEqual(
          listed.map((domain) => domain.domain),
          ["acme.example", "mail.acme.example"]
        );
        assert.deepStrictEqual(read, added);
      })
  );

  test.effect("refuses a domain the Organization already has", () =>
    Effect.gen(function* duplicateDomain() {
      const { client, params } = yield* ownOrganization;

      yield* client.sendingDomains.create({
        params,
        payload: { dkimSelectors: ["s1"], domain: "acme.example" },
      });

      const refused = yield* client.sendingDomains
        .create({
          params,
          payload: { dkimSelectors: ["s2"], domain: "ACME.example" },
        })
        .pipe(Effect.flip);

      assert.strictEqual(refused._tag, "SendingDomainAlreadyExists");
    })
  );

  test.effect(
    "refuses a domain or selector DNS can't name, and a selector given twice",
    () =>
      Effect.gen(function* badNames() {
        const cookie = yield* signedInPerson;
        const client = yield* clientWithCookie(cookie);

        const organization = yield* client.organizations.create({
          payload: { name: "Acme" },
        });

        const path = `/api/organizations/${organization.id}/sending-domains`;

        const statuses = yield* Effect.forEach(
          [
            { dkimSelectors: ["s1"], domain: "localhost" },
            { dkimSelectors: ["s1"], domain: "192.0.2.1" },
            {
              dkimSelectors: ["s1._domainkey.acme.example"],
              domain: "acme.example",
            },
            { dkimSelectors: ["s1", "S1"], domain: "acme.example" },
            {
              dkimSelectors: ["s1"],
              domain: "acme.example",
              returnPath: "not a domain",
            },
          ],
          (payload) =>
            send("POST", path, { body: payload, headers: { cookie } }).pipe(
              Effect.map((response) => response.status)
            )
        );

        assert.deepStrictEqual(statuses, [400, 400, 400, 400, 400]);
      })
  );

  test.effect(
    "checks a Sending Domain's DNS on request and keeps what it found",
    () =>
      Effect.gen(function* checkDomain() {
        const { client, params } = yield* ownOrganization;
        const zone = yield* DnsZone;
        const domain = uniqueDomain("checked");

        yield* zone.set(`s1._domainkey.${domain}`, [
          txtRecord(`v=DKIM1; p=${DKIM_KEY}`),
        ]);
        yield* zone.set(`_dmarc.${domain}`, [txtRecord("v=DMARC1; p=none")]);

        const added = yield* client.sendingDomains.create({
          params,
          payload: { dkimSelectors: ["s1", "s2"], domain },
        });

        const domainParams = { ...params, sendingDomainId: added.id };

        const checked = yield* client.sendingDomains.check({
          params: domainParams,
        });

        const read = yield* client.sendingDomains.get({ params: domainParams });

        assert.deepStrictEqual(
          {
            dkim: checked.check?.dkim.map(({ problem, selector }) => [
              selector,
              problem,
            ]),
            dmarc: checked.check?.dmarc.problem,
            spf: checked.check?.spf.problem,
            status: checked.check?.status,
          },
          {
            dkim: [
              ["s1", null],
              ["s2", "missing"],
            ],
            dmarc: "policy-none",
            spf: "missing",
            status: "blocked",
          }
        );
        assert.deepStrictEqual(read, checked);
      })
  );

  test.effect(
    "keeps the last check when a lookup fails, saying which name",
    () =>
      Effect.gen(function* lookupFails() {
        const owner = yield* ownOrganization;
        const zone = yield* DnsZone;
        const domain = uniqueDomain("unreachable");

        const added = yield* addReadySendingDomain(owner, domain);
        const domainParams = { ...owner.params, sendingDomainId: added.id };

        const checked = yield* owner.client.sendingDomains.check({
          params: domainParams,
        });

        yield* zone.fail(`_dmarc.${domain}`, "Timeout");

        const failed = yield* owner.client.sendingDomains
          .check({ params: domainParams })
          .pipe(Effect.flip);

        const read = yield* owner.client.sendingDomains.get({
          params: domainParams,
        });

        assert.deepStrictEqual(
          failed,
          new DnsLookupFailed({
            detail: "The DNS lookup timed out.",
            name: `_dmarc.${domain}`,
          })
        );
        assert.deepStrictEqual(read.check, checked.check);
      })
  );

  test.effect("removes a Sending Domain", () =>
    Effect.gen(function* removeDomain() {
      const { client, params } = yield* ownOrganization;

      const added = yield* client.sendingDomains.create({
        params,
        payload: { dkimSelectors: ["s1"], domain: "acme.example" },
      });

      const domainParams = { ...params, sendingDomainId: added.id };

      yield* client.sendingDomains.remove({ params: domainParams });

      const read = yield* client.sendingDomains
        .get({ params: domainParams })
        .pipe(Effect.flip);

      const again = yield* client.sendingDomains
        .remove({
          params: { ...params, sendingDomainId: NO_SUCH_SENDING_DOMAIN },
        })
        .pipe(Effect.flip);

      assert.strictEqual(read._tag, "SendingDomainNotFound");
      assert.strictEqual(again._tag, "SendingDomainNotFound");
    })
  );

  test.effect(
    "sends a Campaign only from a Sending Domain of its own Organization",
    () =>
      Effect.gen(function* noSendingDomain() {
        const domain = uniqueDomain("unadded");
        const other = yield* ownOrganization;
        const owner = yield* ownOrganization;

        yield* addReadySendingDomain(other, domain);

        const campaignParams = yield* draftFrom(owner, domain);

        const refused = yield* owner.client.campaigns
          .send({ params: campaignParams })
          .pipe(Effect.flip);

        const scheduleRefused = yield* owner.client.campaigns
          .schedule({ params: campaignParams, payload: NINE_IN_LONDON })
          .pipe(Effect.flip);

        const campaign = yield* owner.client.campaigns.get({
          params: campaignParams,
        });

        assert.deepStrictEqual(refused, new SendingDomainRequired({ domain }));
        assert.strictEqual(scheduleRefused._tag, "SendingDomainRequired");
        assert.strictEqual(campaign.status, "draft");
      })
  );

  test.effect(
    "refuses to send or schedule from a Sending Domain failing DKIM or DMARC, keeping the check",
    () =>
      Effect.gen(function* failingDomain() {
        const zone = yield* DnsZone;
        const noDkim = uniqueDomain("no-dkim");
        const noDmarc = uniqueDomain("no-dmarc");

        const refusals = yield* Effect.forEach([noDkim, noDmarc], (domain) =>
          Effect.gen(function* refusedSend() {
            const owner = yield* ownOrganization;
            const added = yield* addReadySendingDomain(owner, domain);
            const campaignParams = yield* draftFrom(owner, domain);

            yield* domain === noDkim
              ? zone.set(`${READY_SELECTOR}._domainkey.${domain}`, [])
              : zone.set(`_dmarc.${domain}`, []);

            const refused = yield* owner.client.campaigns
              .send({ params: campaignParams })
              .pipe(Effect.flip);

            const scheduleRefused = yield* owner.client.campaigns
              .schedule({ params: campaignParams, payload: NINE_IN_LONDON })
              .pipe(Effect.flip);

            const checked = yield* owner.client.sendingDomains.get({
              params: { ...owner.params, sendingDomainId: added.id },
            });

            const campaign = yield* owner.client.campaigns.get({
              params: campaignParams,
            });

            assert.deepStrictEqual(
              refused,
              new SendingDomainNotReady({ domain, sendingDomainId: added.id })
            );

            return {
              campaign: campaign.status,
              check: checked.check?.status,
              scheduleRefused: scheduleRefused._tag,
            };
          })
        );

        const blocked = {
          campaign: "draft",
          check: "blocked",
          scheduleRefused: "SendingDomainNotReady",
        } as const;

        assert.deepStrictEqual(refusals, [blocked, blocked]);
        assert.isEmpty(yield* sentFrom(noDkim));
        assert.isEmpty(yield* sentFrom(noDmarc));
      })
  );

  test.effect(
    "sends from a Sending Domain with only weaker problems, such as a DMARC policy of none",
    () =>
      Effect.gen(function* warnedDomain() {
        const owner = yield* ownOrganization;
        const zone = yield* DnsZone;
        const domain = uniqueDomain("warned");

        yield* addReadySendingDomain(owner, domain);
        yield* zone.set(`_dmarc.${domain}`, [txtRecord("v=DMARC1; p=none")]);
        yield* zone.set(domain, []);

        const campaignParams = yield* draftFrom(owner, domain);

        const sending = yield* owner.client.campaigns.send({
          params: campaignParams,
        });

        yield* (yield* QueueWorker).deliverAll;

        assert.strictEqual(sending.status, "sending");
        assert.lengthOf(yield* sentFrom(domain), 1);
      })
  );

  test.effect(
    "refuses to send when DNS can't be reached, leaving a draft",
    () =>
      Effect.gen(function* unreachableDns() {
        const owner = yield* ownOrganization;
        const zone = yield* DnsZone;
        const domain = uniqueDomain("timed-out");

        yield* addReadySendingDomain(owner, domain);
        yield* zone.fail(`${READY_SELECTOR}._domainkey.${domain}`, "Timeout");

        const campaignParams = yield* draftFrom(owner, domain);

        const refused = yield* owner.client.campaigns
          .send({ params: campaignParams })
          .pipe(Effect.flip);

        const campaign = yield* owner.client.campaigns.get({
          params: campaignParams,
        });

        assert.strictEqual(refused._tag, "DnsLookupFailed");
        assert.strictEqual(campaign.status, "draft");
      })
  );

  test.effect(
    "makes a scheduled Campaign a draft again when its Sending Domain fails or is gone when it's due",
    () =>
      Effect.gen(function* missedForDomain() {
        const zone = yield* DnsZone;
        const failing = uniqueDomain("failing-later");
        const removed = uniqueDomain("removed-later");

        const scheduled = yield* Effect.forEach([failing, removed], (domain) =>
          Effect.gen(function* scheduleFrom() {
            const owner = yield* ownOrganization;
            const added = yield* addReadySendingDomain(owner, domain);
            const campaignParams = yield* draftFrom(owner, domain);

            yield* owner.client.campaigns.schedule({
              params: campaignParams,
              payload: NINE_IN_LONDON,
            });

            return { added, campaignParams, owner };
          })
        );

        yield* zone.set(`_dmarc.${failing}`, []);

        const [, gone = assert.fail()] = scheduled;

        yield* gone.owner.client.sendingDomains.remove({
          params: { ...gone.owner.params, sendingDomainId: gone.added.id },
        });

        yield* TestClock.setTime(DateTime.toEpochMillis(NINE_IN_LONDON_UTC));
        yield* (yield* QueueWorker).deliverAll;

        const campaigns = yield* pipe(
          scheduled,
          Effect.forEach(({ campaignParams, owner }) =>
            owner.client.campaigns.get({ params: campaignParams })
          )
        );

        assert.deepStrictEqual(
          campaigns.map(({ schedule, status }) => [status, schedule?.missed]),
          [
            ["draft", "sending-domain-not-ready"],
            ["draft", "no-sending-domain"],
          ]
        );
        assert.isEmpty(yield* sentFrom(failing));
        assert.isEmpty(yield* sentFrom(removed));
      }).pipe(withOwnClock)
  );

  test.effect(
    "has a scheduled start whose DNS lookup fails delivered again, still scheduled",
    () =>
      Effect.gen(function* startLookupFails() {
        const owner = yield* ownOrganization;
        const zone = yield* DnsZone;
        const domain = uniqueDomain("start-timed-out");

        yield* addReadySendingDomain(owner, domain);

        const campaignParams = yield* draftFrom(owner, domain);

        yield* owner.client.campaigns.schedule({
          params: campaignParams,
          payload: NINE_IN_LONDON,
        });

        yield* zone.fail(`_dmarc.${domain}`, "ServerFailure");
        yield* TestClock.setTime(DateTime.toEpochMillis(NINE_IN_LONDON_UTC));

        const [start = assert.fail()] = yield* (yield* QueueInbox).takeAll;
        const worker = yield* QueueWorker;

        const failed = yield* worker.deliver(start, 1).pipe(Effect.exit);

        const stillScheduled = yield* owner.client.campaigns.get({
          params: campaignParams,
        });

        yield* readyDomainRecords(domain);
        yield* worker.deliver(start, 2);

        const started = yield* owner.client.campaigns.get({
          params: campaignParams,
        });

        assert.isTrue(Exit.isFailure(failed));
        assert.strictEqual(stillScheduled.status, "scheduled");
        assert.strictEqual(started.status, "sending");
      }).pipe(withOwnClock)
  );
});
