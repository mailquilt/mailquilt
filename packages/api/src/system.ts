import { MailquiltApi } from "@repo/contract";
import { checkHealth } from "@repo/core";
import { HttpApiBuilder } from "effect/http-api";

/**
 * Ports are request requirements, so each runtime decides how long they live:
 * once per process on Node, once per request on Workers.
 */
export const SystemHandlers = HttpApiBuilder.group(
  MailquiltApi,
  "system",
  (handlers) => handlers.handle("health", () => checkHealth)
);
