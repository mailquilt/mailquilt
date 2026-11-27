import type {
  NewSendingDomain,
  SendingDomain,
  SendingDomainAlreadyExists,
  SendingDomainCheck,
  SendingDomainId,
  SendingDomainNotFound,
} from "@repo/domain";
import { SendingDomainNotReady, SendingDomainRequired } from "@repo/domain";
import { Context, Effect, Option } from "effect";

import type { CurrentOrganization } from "./current-organization.ts";
import { checkSendingDomainDns } from "./sending-domain-check.ts";

/** Port: the Sending Domains of the Organization the work acts in. */
export class SendingDomains extends Context.Service<
  SendingDomains,
  {
    /** Every Sending Domain, in the order of their domains. */
    readonly list: () => Effect.Effect<
      readonly SendingDomain[],
      never,
      CurrentOrganization
    >;
    /** Adds a Sending Domain, not checked yet. Fails if the Organization already has its domain. */
    readonly create: (
      domain: typeof NewSendingDomain.Type
    ) => Effect.Effect<
      SendingDomain,
      SendingDomainAlreadyExists,
      CurrentOrganization
    >;
    readonly get: (
      id: SendingDomainId
    ) => Effect.Effect<
      SendingDomain,
      SendingDomainNotFound,
      CurrentOrganization
    >;
    /** The Sending Domain for a domain, such as a From address's, if the Organization has it. */
    readonly find: (
      domain: string
    ) => Effect.Effect<
      Option.Option<SendingDomain>,
      never,
      CurrentOrganization
    >;
    readonly remove: (
      id: SendingDomainId
    ) => Effect.Effect<void, SendingDomainNotFound, CurrentOrganization>;
    /** Keeps what a check of its DNS found, replacing the last one's. */
    readonly saveCheck: (
      id: SendingDomainId,
      check: typeof SendingDomainCheck.Type
    ) => Effect.Effect<
      SendingDomain,
      SendingDomainNotFound,
      CurrentOrganization
    >;
  }
>()("@repo/core/SendingDomains") {}

/** Every Sending Domain in the Organization this request acts in. */
export const listSendingDomains = Effect.gen(
  function* listOrganizationDomains() {
    const domains = yield* SendingDomains;

    return yield* domains.list();
  }
);

/** Adds a Sending Domain to the Organization this request acts in. */
export const addSendingDomain = (domain: typeof NewSendingDomain.Type) =>
  Effect.gen(function* addOrganizationDomain() {
    const domains = yield* SendingDomains;

    return yield* domains.create(domain);
  });

/** One Sending Domain in the Organization, with what its last check found. */
export const getSendingDomain = (id: SendingDomainId) =>
  Effect.gen(function* getOrganizationDomain() {
    const domains = yield* SendingDomains;

    return yield* domains.get(id);
  });

/** Removes a Sending Domain; Campaigns from it can't be sent until it's added again. */
export const removeSendingDomain = (id: SendingDomainId) =>
  Effect.gen(function* removeOrganizationDomain() {
    const domains = yield* SendingDomains;

    return yield* domains.remove(id);
  });

const checkAndSave = (domain: SendingDomain) =>
  Effect.gen(function* checkAndSaveDomain() {
    const domains = yield* SendingDomains;
    const check = yield* checkSendingDomainDns(domain);

    return yield* domains.saveCheck(domain.id, check);
  });

/** Checks a Sending Domain's DNS now, keeps what it found and returns it. */
export const checkSendingDomain = (id: SendingDomainId) =>
  Effect.gen(function* checkOrganizationDomain() {
    const domains = yield* SendingDomains;

    return yield* checkAndSave(yield* domains.get(id));
  });

const domainOf = (email: string) =>
  email.slice(email.lastIndexOf("@") + 1).toLowerCase();

/**
 * Checks, just before a Campaign from `from` is sent or scheduled, that its
 * domain is a Sending Domain whose DNS passes DKIM and DMARC now, keeping
 * what the check found. Fails if the Organization doesn't have the domain,
 * or it fails DKIM or DMARC.
 */
export const requireReadySendingDomain = (from: string) =>
  Effect.gen(function* requireReadyDomain() {
    const domains = yield* SendingDomains;
    const domain = domainOf(from);
    const found = yield* domains.find(domain);

    if (Option.isNone(found)) {
      return yield* new SendingDomainRequired({ domain });
    }

    const checked = yield* checkAndSave(found.value).pipe(
      Effect.catchTag("SendingDomainNotFound", () =>
        Effect.fail(new SendingDomainRequired({ domain }))
      )
    );

    if (checked.check?.status === "blocked") {
      return yield* new SendingDomainNotReady({
        domain,
        sendingDomainId: checked.id,
      });
    }
  });
