import { Layer } from "effect";
import { SecureRandom } from "effect/crypto";

import { ContactsLive } from "./contacts.ts";
import { DatabaseHealthLive, DatabaseLive } from "./database.ts";
import { InstanceLive } from "./instance.ts";
import { ListsLive } from "./lists.ts";
import { OrganizationsLive } from "./organizations.ts";
import { ProviderConnectionsLive } from "./provider-connections.ts";
import { RateLimiterLive } from "./rate-limiter.ts";

export { ContactsLive } from "./contacts.ts";

export { Database, DatabaseHealthLive, DatabaseLive } from "./database.ts";

export { InstanceLive } from "./instance.ts";

export { ListsLive } from "./lists.ts";

export { OrganizationsLive } from "./organizations.ts";

export { ProviderConnectionsLive } from "./provider-connections.ts";

export { RateLimiterLive } from "./rate-limiter.ts";

/**
 * Every port backed by Postgres. Needs a `PgClient` and the
 * `CredentialCipher`, which each runtime provides.
 */
export const DatabasePortsLive = Layer.mergeAll(
  ContactsLive,
  DatabaseHealthLive,
  InstanceLive,
  ListsLive,
  OrganizationsLive,
  ProviderConnectionsLive,
  RateLimiterLive
).pipe(Layer.provide(DatabaseLive), Layer.provide(SecureRandom.layerWebCrypto));
