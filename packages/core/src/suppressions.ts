import type {
  SuppressionId,
  SuppressionNotFound,
  SuppressionNotRemovable,
  SuppressionPage,
  SuppressionsAdded,
} from "@repo/domain";
import { Context, Effect } from "effect";

import type { CurrentOrganization } from "./current-organization.ts";

/** Which page of Suppressions to list (ADR 0008). */
export interface SuppressionFilter {
  readonly after?: SuppressionId;
  readonly before?: SuppressionId;
}

/** Port: the Suppressions of the Organization a request acts in. */
export class Suppressions extends Context.Service<
  Suppressions,
  {
    /** One page of the Suppressions, newest first. */
    readonly page: (
      filter: SuppressionFilter
    ) => Effect.Effect<SuppressionPage, never, CurrentOrganization>;
    /**
     * Suppresses each address by hand (`manual`), in one statement, counting
     * each once whatever its case. An address already Suppressed keeps its
     * Suppression and reason.
     */
    readonly add: (
      emails: readonly string[]
    ) => Effect.Effect<SuppressionsAdded, never, CurrentOrganization>;
    /** Removes a Suppression added by hand. One from a bounce or complaint stays. */
    readonly remove: (
      id: SuppressionId
    ) => Effect.Effect<
      void,
      SuppressionNotFound | SuppressionNotRemovable,
      CurrentOrganization
    >;
  }
>()("@repo/core/Suppressions") {}

/** One page of the Organization's Suppressions, newest first. */
export const listSuppressions = (filter: SuppressionFilter) =>
  Effect.gen(function* listOrganizationSuppressions() {
    const suppressions = yield* Suppressions;

    return yield* suppressions.page(filter);
  });

/** Suppresses addresses by hand in the Organization this request acts in. */
export const addSuppressions = (emails: readonly string[]) =>
  Effect.gen(function* addOrganizationSuppressions() {
    const suppressions = yield* Suppressions;

    return yield* suppressions.add(emails);
  });

/** Removes a Suppression a member added. */
export const removeSuppression = (id: SuppressionId) =>
  Effect.gen(function* removeOrganizationSuppression() {
    const suppressions = yield* Suppressions;

    return yield* suppressions.remove(id);
  });
