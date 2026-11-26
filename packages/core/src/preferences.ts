import {
  ContactIdSchema,
  ListIdSchema,
  OrganizationIdSchema,
} from "@repo/domain";
import type { ContactId, ListId } from "@repo/domain";
import { Context, Effect, Option, Schema } from "effect";

import { CurrentOrganization } from "./current-organization.ts";
import type { CurrentOrganization as CurrentOrganizationTag } from "./current-organization.ts";
import { InvalidToken } from "./invalid-token.ts";
import type { PreferencesTarget } from "./preferences-link.ts";
import { SignedTokens } from "./signed-tokens.ts";
import { Unsubscribes } from "./unsubscribe.ts";

/** One of the Lists a Contact has a Subscription to, and whether they get it. */
export interface PreferenceList {
  readonly id: ListId;
  readonly name: string;
  readonly subscribed: boolean;
}

/** What the preferences page shows a Contact who opened their link. */
export interface ContactPreferences {
  readonly organizationName: string;
  readonly email: string;
  readonly optedOut: boolean;
  /** Only the Lists the Contact has a Subscription to, whatever its status, by name. */
  readonly lists: readonly PreferenceList[];
}

/**
 * Port: the Subscriptions a preferences link changes, in the Organization it
 * names. Only Lists the Contact already has a Subscription to can change, so
 * a link never reveals or joins another List.
 */
export class Preferences extends Context.Service<
  Preferences,
  {
    /** The Contact as the page shows them, or none when the Contact is gone. */
    readonly preferencesOf: (
      contactId: ContactId
    ) => Effect.Effect<
      Option.Option<ContactPreferences>,
      never,
      CurrentOrganizationTag
    >;
    /**
     * Subscribes the Contact to one of their Lists. With an Opt-out, it also
     * lifts it and unsubscribes them from every other List, in one statement,
     * so they get only what they chose, as the page showed it.
     */
    readonly subscribe: (
      contactId: ContactId,
      listId: ListId
    ) => Effect.Effect<void, never, CurrentOrganizationTag>;
    /** Unsubscribes the Contact from one of their Lists. */
    readonly unsubscribe: (
      contactId: ContactId,
      listId: ListId
    ) => Effect.Effect<void, never, CurrentOrganizationTag>;
  }
>()("@repo/core/Preferences") {}

const Target = Schema.Tuple([OrganizationIdSchema, ContactIdSchema]);

const decodeTarget = Schema.decodeUnknownEffect(Target);

const decodeListId = Schema.decodeUnknownEffect(ListIdSchema);

const targetOf = (token: string) =>
  Effect.gen(function* target() {
    const tokens = yield* SignedTokens;
    const payload = yield* tokens.verify("preferences", token);

    const [organizationId, contactId] = yield* decodeTarget(
      payload.split(".")
    ).pipe(Effect.mapError(() => new InvalidToken()));

    return { contactId, organizationId } satisfies PreferencesTarget;
  });

// WARNING: the link's signature is the only check here, as an unsubscribe link's is (ADR 0016): only this install can sign one, for one Contact.
const inOrganizationOf =
  (target: PreferencesTarget) =>
  <A, E, R>(effect: Effect.Effect<A, E, R>) =>
    effect.pipe(
      Effect.provideService(CurrentOrganization, { id: target.organizationId })
    );

const foundFor = (target: PreferencesTarget) =>
  Effect.gen(function* findPreferences() {
    const preferences = yield* Preferences;

    const found = yield* preferences
      .preferencesOf(target.contactId)
      .pipe(inOrganizationOf(target));

    if (Option.isNone(found)) {
      return yield* new InvalidToken();
    }

    return found.value;
  });

/** What the preferences page shows for a link. Changes nothing. */
export const preferencesPage = (token: string) =>
  Effect.gen(function* readPreferencesPage() {
    return yield* foundFor(yield* targetOf(token));
  });

const changeList =
  (change: "subscribe" | "unsubscribe") => (token: string, list: string) =>
    Effect.gen(function* changeSubscription() {
      const target = yield* targetOf(token);

      const listId = yield* decodeListId(list).pipe(
        Effect.mapError(() => new InvalidToken())
      );

      const preferences = yield* Preferences;

      yield* foundFor(target);
      yield* preferences[change](target.contactId, listId).pipe(
        inOrganizationOf(target)
      );
    });

/** Subscribes the link's Contact to one of their Lists, lifting an Opt-out. */
export const subscribeToList = changeList("subscribe");

/** Unsubscribes the link's Contact from one of their Lists. */
export const unsubscribeFromList = changeList("unsubscribe");

/** Records an Opt-out for the link's Contact, from their preferences page. */
export const stopAllFromPreferences = (token: string) =>
  Effect.gen(function* optOutFromPreferences() {
    const target = yield* targetOf(token);
    const unsubscribes = yield* Unsubscribes;

    yield* foundFor(target);
    yield* unsubscribes.optOut(target.contactId).pipe(inOrganizationOf(target));
  });
