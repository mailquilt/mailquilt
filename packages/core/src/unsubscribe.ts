import {
  CampaignIdSchema,
  ContactIdSchema,
  OrganizationIdSchema,
} from "@repo/domain";
import type { CampaignId, ContactId, OrganizationId } from "@repo/domain";
import { Context, Effect, Option, Schema } from "effect";

import { CurrentOrganization } from "./current-organization.ts";
import type { CurrentOrganization as CurrentOrganizationTag } from "./current-organization.ts";
import { InvalidToken } from "./invalid-token.ts";
import { PublicUrl } from "./public-url.ts";
import { SignedTokens } from "./signed-tokens.ts";

/** Whom an unsubscribe link is for: one Contact, from one Campaign, in one Organization. */
export interface UnsubscribeTarget {
  readonly organizationId: OrganizationId;
  readonly campaignId: CampaignId;
  readonly contactId: ContactId;
}

/** What the unsubscribe page shows a Contact who opened their link. */
export interface Unsubscription {
  readonly organizationName: string;
  readonly email: string;
  readonly listNames: readonly string[];
  readonly subscribed: boolean;
  readonly optedOut: boolean;
}

/**
 * Port: the Subscriptions and Opt-outs an unsubscribe link acts on, in the
 * Organization it names.
 */
export class Unsubscribes extends Context.Service<
  Unsubscribes,
  {
    /** The Contact as the page shows them, or none when the Campaign or the Contact is gone. */
    readonly unsubscriptionOf: (
      campaignId: CampaignId,
      contactId: ContactId
    ) => Effect.Effect<
      Option.Option<Unsubscription>,
      never,
      CurrentOrganizationTag
    >;
    /** Unsubscribes the Contact from every List the Campaign targeted. */
    readonly unsubscribe: (
      campaignId: CampaignId,
      contactId: ContactId
    ) => Effect.Effect<void, never, CurrentOrganizationTag>;
    /** Records the Contact's Opt-out, if they haven't one already. */
    readonly optOut: (
      contactId: ContactId
    ) => Effect.Effect<void, never, CurrentOrganizationTag>;
  }
>()("@repo/core/Unsubscribes") {}

const Target = Schema.Tuple([
  OrganizationIdSchema,
  CampaignIdSchema,
  ContactIdSchema,
]);

const decodeTarget = Schema.decodeUnknownEffect(Target);

/** The URL of a Contact's unsubscribe page, which their mail app also posts to for one-click unsubscribe. */
export const unsubscribeUrl = (target: UnsubscribeTarget) =>
  Effect.gen(function* unsubscribeLink() {
    const tokens = yield* SignedTokens;
    const { origin } = yield* PublicUrl;

    const token = yield* tokens.sign(
      "unsubscribe",
      [target.organizationId, target.campaignId, target.contactId].join(".")
    );

    return `${origin}/unsubscribe?token=${token}`;
  });

const CLOSING_BODY = /<\/body>/giu;

/**
 * The Campaign's HTML with an unsubscribe link at its foot, inside `<body>`
 * when it has one. The link is a URL this install made, so it needs no
 * escaping beyond what it already is.
 */
export const withUnsubscribeLink = (html: string, url: string) => {
  const footer = `<p style="margin:32px 0 0;font-family:Arial,sans-serif;font-size:13px;line-height:1.5;color:#52525b;text-align:center">Don’t want these emails? <a href="${url}" style="color:#52525b">Unsubscribe</a></p>`;
  const closings = [...html.matchAll(CLOSING_BODY)];
  const last = closings.at(-1);

  return last === undefined
    ? `${html}${footer}`
    : `${html.slice(0, last.index)}${footer}${html.slice(last.index)}`;
};

/** The Campaign's plain-text part with an unsubscribe line at its foot, matching `withUnsubscribeLink`. */
export const withUnsubscribeLine = (text: string, url: string) =>
  `${text}\n\nDon’t want these emails? Unsubscribe:\n${url}`;

/** The headers that let a mail app offer its own one-click unsubscribe (RFC 8058). */
export const unsubscribeHeaders = (url: string) => ({
  "List-Unsubscribe": `<${url}>`,
  "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
});

const targetOf = (token: string) =>
  Effect.gen(function* target() {
    const tokens = yield* SignedTokens;
    const payload = yield* tokens.verify("unsubscribe", token);

    const [organizationId, campaignId, contactId] = yield* decodeTarget(
      payload.split(".")
    ).pipe(Effect.mapError(() => new InvalidToken()));

    return {
      campaignId,
      contactId,
      organizationId,
    } satisfies UnsubscribeTarget;
  });

// WARNING: the link's signature is the only check here, as a queue message's is the app's own (ADR 0007): only this install can sign one, for one Contact.
const inOrganizationOf =
  (target: UnsubscribeTarget) =>
  <A, E, R>(effect: Effect.Effect<A, E, R>) =>
    effect.pipe(
      Effect.provideService(CurrentOrganization, { id: target.organizationId })
    );

const foundFor = (target: UnsubscribeTarget) =>
  Effect.gen(function* found() {
    const unsubscribes = yield* Unsubscribes;

    const unsubscription = yield* unsubscribes
      .unsubscriptionOf(target.campaignId, target.contactId)
      .pipe(inOrganizationOf(target));

    if (Option.isNone(unsubscription)) {
      return yield* new InvalidToken();
    }

    return unsubscription.value;
  });

/** What the unsubscribe page shows for a link. Changes nothing. */
export const unsubscribePage = (token: string) =>
  Effect.gen(function* readUnsubscribePage() {
    return yield* foundFor(yield* targetOf(token));
  });

/** Unsubscribes the link's Contact from every List its Campaign targeted. */
export const unsubscribe = (token: string) =>
  Effect.gen(function* unsubscribeFromCampaign() {
    const target = yield* targetOf(token);
    const unsubscribes = yield* Unsubscribes;

    yield* foundFor(target);
    yield* unsubscribes
      .unsubscribe(target.campaignId, target.contactId)
      .pipe(inOrganizationOf(target));
  });

/** Records an Opt-out for the link's Contact: no more Campaigns from the Organization. */
export const stopAllEmail = (token: string) =>
  Effect.gen(function* optOutOfOrganization() {
    const target = yield* targetOf(token);
    const unsubscribes = yield* Unsubscribes;

    yield* foundFor(target);
    yield* unsubscribes.optOut(target.contactId).pipe(inOrganizationOf(target));
  });
