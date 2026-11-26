import type { ContactId, OrganizationId } from "@repo/domain";
import { Effect } from "effect";

import { PublicUrl } from "./public-url.ts";
import { SignedTokens } from "./signed-tokens.ts";

/** Whose preferences a link opens: one Contact, in one Organization. */
export interface PreferencesTarget {
  readonly organizationId: OrganizationId;
  readonly contactId: ContactId;
}

/**
 * The path of a Contact's preferences page, relative to the install. The
 * token never expires, as an unsubscribe link's doesn't: a link in an old
 * email keeps working (ADR 0016).
 */
export const preferencesPath = (target: PreferencesTarget) =>
  Effect.gen(function* preferencesLink() {
    const tokens = yield* SignedTokens;

    const token = yield* tokens.sign(
      "preferences",
      [target.organizationId, target.contactId].join(".")
    );

    return `/preferences?token=${token}`;
  });

/** The full URL of a Contact's preferences page, for an email. */
export const preferencesUrl = (target: PreferencesTarget) =>
  Effect.gen(function* preferencesFullUrl() {
    const { origin } = yield* PublicUrl;

    return `${origin}${yield* preferencesPath(target)}`;
  });
