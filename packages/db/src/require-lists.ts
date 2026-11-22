import type { ListId, OrganizationId } from "@repo/domain";
import { ListNotFound } from "@repo/domain";
import { and, count, eq, inArray } from "drizzle-orm";
import type { EffectPgDatabase } from "drizzle-orm/effect-postgres";
import { Effect } from "effect";

import { lists } from "./schema.ts";

/**
 * Succeeds when `organization` has every List in `ids`, and fails with
 * `ListNotFound` otherwise, in one query.
 */
export const requireLists = (
  db: EffectPgDatabase,
  organization: OrganizationId,
  ids: readonly ListId[]
) => {
  const unique = [...new Set(ids)];

  if (unique.length === 0) {
    return Effect.void;
  }

  return db
    .select({ found: count() })
    .from(lists)
    .where(
      and(eq(lists.organizationId, organization), inArray(lists.id, unique))
    )
    .pipe(
      Effect.orDie,
      Effect.flatMap(([row]) =>
        row?.found === unique.length
          ? Effect.void
          : Effect.fail(new ListNotFound())
      )
    );
};
