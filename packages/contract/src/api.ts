import { HttpApi } from "effect/http-api";

import { SystemApi } from "./system.ts";

export class MailquiltApi extends HttpApi.make("mailquilt").add(SystemApi) {}
