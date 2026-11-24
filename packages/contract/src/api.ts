import { HttpApi } from "effect/http-api";

import { CampaignsApi } from "./campaigns.ts";
import { ContactsApi } from "./contacts.ts";
import { InstanceApi } from "./instance.ts";
import { ListsApi } from "./lists.ts";
import { OrganizationsApi } from "./organizations.ts";
import { ProviderConnectionsApi } from "./provider-connections.ts";
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
  .add(ProviderConnectionsApi)
  .add(CampaignsApi)
  .add(InstanceApi)
  .prefix("/api")
  .add(SystemApi) {}
