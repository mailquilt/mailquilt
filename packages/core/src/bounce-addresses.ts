import {
  CampaignIdSchema,
  ContactIdSchema,
  OrganizationIdSchema,
} from "@repo/domain";
import type { CampaignId, ContactId, OrganizationId } from "@repo/domain";
import { Effect, Option, Schema } from "effect";

import { BounceDomain } from "./bounce-domain.ts";
import { BounceReports } from "./bounce-reports.ts";
import { CurrentOrganization } from "./current-organization.ts";
import { DeliveryFeedback } from "./delivery-feedback.ts";
import { SignedTokens } from "./signed-tokens.ts";

/** Whose email a bounce address was on: one Contact, from one Campaign, in one Organization. */
export interface BounceTarget {
  readonly organizationId: OrganizationId;
  readonly campaignId: CampaignId;
  readonly contactId: ContactId;
}

const ID_LENGTH = 26;

const Target = Schema.Tuple([
  OrganizationIdSchema,
  CampaignIdSchema,
  ContactIdSchema,
]);

const decodeTarget = Schema.decodeUnknownOption(Target);

// WARNING: a TypeID's prefix is the same for every ID of its type, so only the 26 characters after it are signed, keeping the address as short as it can be (ADR 0021).
const suffixOf = (id: string) => id.slice(id.indexOf("_") + 1);

/**
 * The address a Contact's Campaign email is sent from in the SMTP envelope,
 * so its bounce comes back to this install: a compact signed token naming
 * the Organization, Campaign and Contact, at the bounce domain (ADR 0021).
 * `None` when the install receives no bounces.
 */
export const bounceAddressFor = (target: BounceTarget) =>
  Effect.gen(function* bounceAddress() {
    const { domain } = yield* BounceDomain;

    if (Option.isNone(domain)) {
      return Option.none<string>();
    }

    const tokens = yield* SignedTokens;

    const token = yield* tokens.signCompact(
      "bounce",
      [target.organizationId, target.campaignId, target.contactId]
        .map(suffixOf)
        .join("")
    );

    return Option.some(`${token}@${domain.value}`);
  });

const targetOf = (to: string) =>
  Effect.gen(function* target() {
    const { domain } = yield* BounceDomain;
    const tokens = yield* SignedTokens;
    const at = to.lastIndexOf("@");

    if (
      Option.isNone(domain) ||
      to.slice(at + 1).toLowerCase() !== domain.value.toLowerCase()
    ) {
      return Option.none<BounceTarget>();
    }

    const payload = yield* tokens
      .verifyCompact("bounce", to.slice(0, at))
      .pipe(Effect.option);

    return payload.pipe(
      Option.flatMap((ids) =>
        decodeTarget([
          `org_${ids.slice(0, ID_LENGTH)}`,
          `cmp_${ids.slice(ID_LENGTH, ID_LENGTH * 2)}`,
          `cnt_${ids.slice(ID_LENGTH * 2)}`,
        ]).pipe(
          Option.map(
            ([organizationId, campaignId, contactId]) =>
              ({
                campaignId,
                contactId,
                organizationId,
              }) satisfies BounceTarget
          )
        )
      )
    );
  });

/**
 * What became of an email to the bounce domain: a `bounce` recorded, an
 * address this install didn't sign, or an email that isn't a bounce.
 */
export type BounceOutcome = "bounce" | "not-signed" | "not-a-bounce";

// WARNING: the bounce address's token is the only check of whose bounce this is, as an unsubscribe link's is (ADR 0016, 0021): only this install can sign one, for one Contact and Campaign.
const inOrganizationOf =
  (target: BounceTarget) =>
  <A, E, R>(effect: Effect.Effect<A, E, R>) =>
    effect.pipe(
      Effect.provideService(CurrentOrganization, { id: target.organizationId })
    );

/**
 * Handles one email sent to `to` at the bounce domain: a delivery status
 * report to an address this install signed records its bounce for that
 * Contact and Campaign, with the same Suppression rules as SES's (ADR 0019).
 * Anything else changes nothing: an address that's forged, unsigned or at
 * another domain, and an email that isn't a failed delivery's report.
 */
export const receiveBounce = (to: string, raw: Uint8Array) =>
  Effect.gen(function* receive() {
    const target = yield* targetOf(to);

    if (Option.isNone(target)) {
      return "not-signed" satisfies BounceOutcome;
    }

    const reports = yield* BounceReports;
    const kind = yield* reports.read(raw);

    if (Option.isNone(kind)) {
      return "not-a-bounce" satisfies BounceOutcome;
    }

    const feedback = yield* DeliveryFeedback;

    yield* feedback
      .recordBounce(target.value, kind.value)
      .pipe(inOrganizationOf(target.value));

    return "bounce" satisfies BounceOutcome;
  });
