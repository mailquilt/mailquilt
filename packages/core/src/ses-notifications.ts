import {
  OrganizationIdSchema,
  ProviderConnectionIdSchema,
  ProviderConnectionNotFound,
} from "@repo/domain";
import type { OrganizationId, ProviderConnectionId } from "@repo/domain";
import { Context, DateTime, Duration, Effect, Schema } from "effect";
import type { Option } from "effect";

import { CurrentOrganization } from "./current-organization.ts";
import { DeliveryFeedback } from "./delivery-feedback.ts";
import type { SesFeedback } from "./delivery-feedback.ts";
import { InvalidSnsMessage } from "./invalid-sns-message.ts";
import { InvalidToken } from "./invalid-token.ts";
import { ProviderConnections } from "./provider-connections.ts";
import { PublicUrl } from "./public-url.ts";
import { SignedTokens } from "./signed-tokens.ts";
import type { SnsUnreachable } from "./sns-unreachable.ts";

/**
 * An SNS message whose signature has been checked. `id` is SNS's
 * `MessageId` and `timestamp` when SNS first sent it, which every retry
 * repeats. A `Notification` carries SES's bounce or complaint, or `None`
 * for anything else, such as a delivery.
 */
export type SnsMessage =
  | {
      readonly type: "SubscriptionConfirmation";
      readonly id: string;
      readonly timestamp: DateTime.Utc;
      readonly subscribeUrl: string;
    }
  | {
      readonly type: "UnsubscribeConfirmation";
      readonly id: string;
      readonly timestamp: DateTime.Utc;
    }
  | {
      readonly type: "Notification";
      readonly id: string;
      readonly timestamp: DateTime.Utc;
      readonly feedback: Option.Option<SesFeedback>;
    };

/**
 * Port: reads the SNS messages Amazon SES's bounces and complaints arrive
 * in. `read` checks the signature against SNS's signing certificate, fetched
 * only from SNS's own host through the outbound guard, before trusting a
 * word of it. `confirmSubscription` confirms a subscription by fetching its
 * `SubscribeURL`, under the same rule.
 */
export class SesNotifications extends Context.Service<
  SesNotifications,
  {
    readonly read: (
      body: string
    ) => Effect.Effect<SnsMessage, InvalidSnsMessage | SnsUnreachable>;
    readonly confirmSubscription: (
      subscribeUrl: string
    ) => Effect.Effect<void, InvalidSnsMessage | SnsUnreachable>;
  }
>()("@repo/core/SesNotifications") {}

// WARNING: only an SES connection has a notifications URL; an SMTP one is answered as if it didn't exist.
const requireSesConnection = (id: ProviderConnectionId) =>
  Effect.gen(function* sesConnection() {
    const connections = yield* ProviderConnections;
    const all = yield* connections.all;

    if (
      !all.some(
        (connection) => connection.id === id && connection.provider === "ses"
      )
    ) {
      return yield* new ProviderConnectionNotFound();
    }
  });

// WARNING: SNS stops retrying an HTTP delivery within an hour, so no genuine message is older; one that is is a replay, and a copy within the hour is caught by its recorded ID.
/** How long after SNS first sends a message it's accepted, and its ID kept. */
export const SNS_MESSAGE_LIFETIME = Duration.hours(1);

interface NotificationsTarget {
  readonly organizationId: OrganizationId;
  readonly providerConnectionId: ProviderConnectionId;
}

const Target = Schema.Tuple([OrganizationIdSchema, ProviderConnectionIdSchema]);

const decodeTarget = Schema.decodeUnknownEffect(Target);

const targetOf = (token: string) =>
  Effect.gen(function* target() {
    const tokens = yield* SignedTokens;
    const payload = yield* tokens.verify("ses-notifications", token);

    const [organizationId, providerConnectionId] = yield* decodeTarget(
      payload.split(".")
    ).pipe(Effect.mapError(() => new InvalidToken()));

    return {
      organizationId,
      providerConnectionId,
    } satisfies NotificationsTarget;
  });

/**
 * The URL an SES Provider Connection's SNS topic posts its bounces and
 * complaints to. Its token names the Organization and the connection, and
 * is the only credential (ADR 0019).
 */
export const sesNotificationsUrl = (
  providerConnectionId: ProviderConnectionId
) =>
  Effect.gen(function* notificationsUrl() {
    const { id: organizationId } = yield* CurrentOrganization;
    const tokens = yield* SignedTokens;
    const { origin } = yield* PublicUrl;

    yield* requireSesConnection(providerConnectionId);

    const token = yield* tokens.sign(
      "ses-notifications",
      [organizationId, providerConnectionId].join(".")
    );

    return `${origin}/api/webhooks/ses?token=${token}`;
  });

// WARNING: the URL's token is the only check of whose message this is, as an unsubscribe link's is (ADR 0016, 0019): only this install can sign one, for one connection.
const inOrganizationOf =
  (target: NotificationsTarget) =>
  <A, E, R>(effect: Effect.Effect<A, E, R>) =>
    effect.pipe(
      Effect.provideService(CurrentOrganization, { id: target.organizationId })
    );

/**
 * Handles one SNS message posted to an SES Provider Connection's
 * notifications URL: confirms a subscription, and records a bounce or
 * complaint once. A token that doesn't name an SES connection this install
 * still has fails with `InvalidToken`, and a message SNS didn't sign, or
 * older than an hour, with `InvalidSnsMessage`.
 */
export const receiveSesNotification = (token: string, body: string) =>
  Effect.gen(function* receiveNotification() {
    const target = yield* targetOf(token);
    const notifications = yield* SesNotifications;
    const feedback = yield* DeliveryFeedback;

    yield* requireSesConnection(target.providerConnectionId).pipe(
      inOrganizationOf(target),
      Effect.mapError(() => new InvalidToken())
    );

    const message = yield* notifications.read(body);
    const now = yield* DateTime.now;

    const expiresAt = DateTime.addDuration(
      message.timestamp,
      SNS_MESSAGE_LIFETIME
    );

    if (DateTime.isLessThan(expiresAt, now)) {
      return yield* new InvalidSnsMessage({
        detail: `SNS sent this message at ${DateTime.formatIso(message.timestamp)}, more than an hour ago.`,
      });
    }

    if (message.type === "SubscriptionConfirmation") {
      return yield* notifications.confirmSubscription(message.subscribeUrl);
    }

    if (message.type === "Notification" && message.feedback._tag === "Some") {
      yield* feedback
        .record({ expiresAt, id: message.id }, message.feedback.value)
        .pipe(inOrganizationOf(target));
    }
  });
