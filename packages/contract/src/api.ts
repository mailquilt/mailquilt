import { HttpApi } from "effect/http-api";

import { SystemApi } from "./system.ts";

/**
 * The public API. Every group is served under `/api` (ADR 0004): add new
 * groups before `.prefix("/api")`. Only `system` stays at the root, so
 * health checks can reach `/health`.
 */
export class MailquiltApi extends HttpApi.make("mailquilt")
  .prefix("/api")
  .add(SystemApi) {}
