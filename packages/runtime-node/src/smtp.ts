import { smtpProviderLayer } from "@repo/providers/smtp";
import { Layer } from "effect";

import { OutboundGuardFromEnv } from "./outbound-guard.ts";

/**
 * Sends through SMTP servers with Nodemailer, behind the outbound guard on the
 * system's resolver. `BLOCK_PRIVATE_NETWORKS` (off by default) stops
 * connections to private networks and loopback too, for an install that
 * shouldn't reach its own network (ADR 0010).
 */
export const SmtpProviderLive = smtpProviderLayer().pipe(
  Layer.provide(OutboundGuardFromEnv)
);
