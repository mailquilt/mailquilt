import { DnsZone, txtRecord } from "@repo/core/testing";
import type { OrganizationId } from "@repo/domain";
import { Effect } from "effect";

import type { ownOrganization } from "./accounts.ts";

type Owner = Pick<Effect.Success<typeof ownOrganization>, "client"> & {
  readonly params: { readonly organizationId: OrganizationId };
};

/** A DKIM public key, as a Provider would publish it. */
export const DKIM_KEY =
  "MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDwIRP/UC3SBsEmGqZ9ZJW3/DkM";

/** The DKIM selector `readyDomainRecords` publishes a key under. */
export const READY_SELECTOR = "mq";

/** Publishes, in the scripted DNS, a DKIM key, a DMARC policy of `reject` and SPF for `domain`. */
export const readyDomainRecords = (domain: string) =>
  Effect.gen(function* publishReadyRecords() {
    const zone = yield* DnsZone;

    yield* zone.set(`${READY_SELECTOR}._domainkey.${domain}`, [
      txtRecord(`v=DKIM1; k=rsa; p=${DKIM_KEY}`),
    ]);
    yield* zone.set(`_dmarc.${domain}`, [txtRecord("v=DMARC1; p=reject")]);
    yield* zone.set(domain, [txtRecord("v=spf1 include:spf.example.com -all")]);
  });

/** Adds `domain`, `acme.example` by default, as a Sending Domain whose DNS passes every check. */
export const addReadySendingDomain = (
  { client, params }: Owner,
  domain = "acme.example"
) =>
  Effect.gen(function* addReadyDomain() {
    yield* readyDomainRecords(domain);

    return yield* client.sendingDomains.create({
      params,
      payload: { dkimSelectors: [READY_SELECTOR], domain },
    });
  });
