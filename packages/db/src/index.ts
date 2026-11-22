import { Layer } from "effect";
import { SecureRandom } from "effect/crypto";

import { ContactsLive } from "./contacts.ts";
import { DatabaseHealthLive, DatabaseLive } from "./database.ts";
import { ListsLive } from "./lists.ts";
import { OrganizationsLive } from "./organizations.ts";
import { RateLimiterLive } from "./rate-limiter.ts";

export { ContactsLive } from "./contacts.ts";

export { Database, DatabaseHealthLive, DatabaseLive } from "./database.ts";

export { ListsLive } from "./lists.ts";

export { OrganizationsLive } from "./organizations.ts";

export { RateLimiterLive } from "./rate-limiter.ts";

/** Every port backed by Postgres. Needs a `PgClient`, which each runtime provides. */
export const DatabasePortsLive = Layer.mergeAll(
  ContactsLive,
  DatabaseHealthLive,
  ListsLive,
  OrganizationsLive,
  RateLimiterLive
).pipe(Layer.provide(DatabaseLive), Layer.provide(SecureRandom.layerWebCrypto));
