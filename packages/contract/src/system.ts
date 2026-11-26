import { Health } from "@repo/domain";
import { HttpApiEndpoint, HttpApiGroup } from "effect/http-api";

import { DatabaseUnreachableError } from "./errors.ts";

export class SystemApi extends HttpApiGroup.make("system", {
  topLevel: true,
}).add(
  HttpApiEndpoint.get("health", "/health", {
    error: DatabaseUnreachableError,
    success: Health,
  })
) {}
