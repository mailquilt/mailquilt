import { sesNotificationsLayer } from "@repo/providers/sns";
import { Layer } from "effect";
import { FetchHttpClient } from "effect/http";

import { OutboundGuardFromConfig } from "./outbound-guard.ts";

/**
 * Reads SES's bounces and complaints from SNS with Workers' `fetch`, which
 * doesn't follow redirects here. The outbound guard checks SNS's host before
 * each fetch; the fetch connects by name, as the host is always
 * `sns.<region>.amazonaws.com` (ADR 0019).
 */
export const SesNotificationsLive = sesNotificationsLayer.pipe(
  Layer.provide(
    FetchHttpClient.layer.pipe(
      Layer.provide(
        Layer.succeed(FetchHttpClient.RequestInit, { redirect: "manual" })
      )
    )
  ),
  Layer.provide(OutboundGuardFromConfig)
);
