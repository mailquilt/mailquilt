import { Layer } from "effect";
import { SecureRandom } from "effect/crypto";

import { CampaignsLive } from "./campaigns.ts";
import { ContactsLive } from "./contacts.ts";
import { DatabaseHealthLive, DatabaseLive } from "./database.ts";
import { DeliveryEventPartitionsLive } from "./delivery-event-partitions.ts";
import { DeliveryFeedbackLive } from "./delivery-feedback.ts";
import { InstanceLive } from "./instance.ts";
import { ListsLive } from "./lists.ts";
import { OrganizationsLive } from "./organizations.ts";
import { PreferencesLive } from "./preferences.ts";
import { ProviderConnectionsLive } from "./provider-connections.ts";
import { RateLimiterLive } from "./rate-limiter.ts";
import { SuppressionsLive } from "./suppressions.ts";
import { UnsubscribesLive } from "./unsubscribes.ts";

export { CampaignsLive } from "./campaigns.ts";

export { ContactsLive } from "./contacts.ts";

export { Database, DatabaseHealthLive, DatabaseLive } from "./database.ts";

export { DeliveryEventPartitionsLive } from "./delivery-event-partitions.ts";

export { DeliveryFeedbackLive } from "./delivery-feedback.ts";

export { InstanceLive } from "./instance.ts";

export { ListsLive } from "./lists.ts";

export { OrganizationsLive } from "./organizations.ts";

export { PreferencesLive } from "./preferences.ts";

export { ProviderConnectionsLive } from "./provider-connections.ts";

export { forwardQueueOutbox, QueueOutboxLive } from "./queue-outbox.ts";

export type { EncodedQueueMessage } from "./queue-outbox.ts";

export { RateLimiterLive } from "./rate-limiter.ts";

export { SuppressionsLive } from "./suppressions.ts";

export { UnsubscribesLive } from "./unsubscribes.ts";

/**
 * Every port backed by Postgres. Needs a `PgClient` and the
 * `CredentialCipher`, which each runtime provides.
 */
export const DatabasePortsLive = Layer.mergeAll(
  CampaignsLive,
  ContactsLive,
  DatabaseHealthLive,
  DeliveryEventPartitionsLive,
  DeliveryFeedbackLive,
  InstanceLive,
  ListsLive,
  OrganizationsLive,
  PreferencesLive,
  ProviderConnectionsLive,
  RateLimiterLive,
  SuppressionsLive,
  UnsubscribesLive
).pipe(Layer.provide(DatabaseLive), Layer.provide(SecureRandom.layerWebCrypto));
