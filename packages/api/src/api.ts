import { MailquiltApi } from "@repo/contract";
import { ByteSize, Layer } from "effect";
import { HttpIncomingMessage, HttpRouter } from "effect/http";
import { HttpApiBuilder } from "effect/http-api";

import { AuthRoutes } from "./auth/routes.ts";
import { CampaignsHandlers } from "./campaigns.ts";
import { ContactsHandlers } from "./contacts.ts";
import { InstanceHandlers } from "./instance.ts";
import { ListsHandlers } from "./lists.ts";
import { OrganizationsHandlers } from "./organizations.ts";
import { PreferencesRoutes } from "./preferences/routes.ts";
import { ProviderConnectionsHandlers } from "./provider-connections.ts";
import { SendingDomainsHandlers } from "./sending-domains.ts";
import { SuppressionsHandlers } from "./suppressions.ts";
import { SystemHandlers } from "./system.ts";
import { UnsubscribeRoutes } from "./unsubscribe/routes.ts";
import { SesWebhookRoutes } from "./webhooks/ses.ts";

const MAX_API_BODY_SIZE = ByteSize.kibibytes(64);

/**
 * Every route the app serves: the public API, Better Auth behind our allow
 * list, the unsubscribe and preferences pages links in emails open, and the
 * webhook SES's bounces and complaints arrive at. The ports its use cases call are request requirements: each
 * runtime provides them per request. A request body larger than 64 KiB is
 * refused with 413, before anyone is signed in: at once when its
 * `Content-Length` says so, or else as soon as more than 64 KiB of it has
 * arrived.
 */
export const ApiLive = Layer.mergeAll(
  HttpApiBuilder.layer(MailquiltApi).pipe(
    Layer.provide(
      Layer.mergeAll(
        CampaignsHandlers,
        ContactsHandlers,
        InstanceHandlers,
        ListsHandlers,
        OrganizationsHandlers,
        ProviderConnectionsHandlers,
        SendingDomainsHandlers,
        SuppressionsHandlers,
        SystemHandlers
      )
    ),
    HttpRouter.provideRequest(
      Layer.succeed(HttpIncomingMessage.MaxBodySize, MAX_API_BODY_SIZE)
    )
  ),
  AuthRoutes,
  PreferencesRoutes,
  SesWebhookRoutes,
  UnsubscribeRoutes
);
