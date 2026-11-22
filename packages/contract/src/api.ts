import { HttpApi } from "effect/http-api";

import { ContactsApi } from "./contacts.ts";
import { ListsApi } from "./lists.ts";
import { OrganizationsApi } from "./organizations.ts";
import { SystemApi } from "./system.ts";

/**
 * The public API. Every group is served under `/api` (ADR 0004): add new
 * groups before `.prefix("/api")`. Only `system` stays at the root, so
 * health checks can reach `/health`.
 */
export class MailquiltApi extends HttpApi.make("mailquilt")
  .add(OrganizationsApi)
  .add(ContactsApi)
  .add(ListsApi)
  .prefix("/api")
  .add(SystemApi) {}
