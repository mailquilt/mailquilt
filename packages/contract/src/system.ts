import { DatabaseUnreachable, Health } from "@repo/domain";
import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from "effect/http-api";

export class SystemApi extends HttpApiGroup.make("system", {
  topLevel: true,
}).add(
  HttpApiEndpoint.get("health", "/health", {
    error: DatabaseUnreachable.pipe(HttpApiSchema.status(503)),
    success: Health,
  })
) {}
