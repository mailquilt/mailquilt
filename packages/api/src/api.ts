import { MailquiltApi } from "@repo/contract";
import { Layer } from "effect";
import { HttpApiBuilder } from "effect/http-api";

import { AuthRoutes } from "./auth/routes.ts";
import { SystemHandlers } from "./system.ts";

/**
 * Every route the app serves: the public API, and Better Auth behind our
 * allow list. The ports its use cases call are request requirements: each
 * runtime provides them per request.
 */
export const ApiLive = Layer.mergeAll(
  HttpApiBuilder.layer(MailquiltApi).pipe(Layer.provide(SystemHandlers)),
  AuthRoutes
);
