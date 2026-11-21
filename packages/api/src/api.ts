import { MailquiltApi } from "@repo/contract";
import { Layer } from "effect";
import { HttpApiBuilder } from "effect/http-api";

import { SystemHandlers } from "./system.ts";

/**
 * Every route of the public API. The ports its use cases call are request
 * requirements: each runtime provides them per request.
 */
export const ApiLive = HttpApiBuilder.layer(MailquiltApi).pipe(
  Layer.provide(SystemHandlers)
);
