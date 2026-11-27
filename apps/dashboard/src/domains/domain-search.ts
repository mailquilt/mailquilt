import { DomainName } from "@repo/domain";
import { Schema } from "effect";

import { droppedIfInvalid } from "../search-in-url.ts";

const AddDomainSearchInUrl = Schema.Struct({
  domain: Schema.optionalKey(droppedIfInvalid(DomainName)),
});

/**
 * The domain Add a domain starts with, such as a draft's from address's,
 * when a draft's page sent the person here. A part that doesn't parse is
 * dropped.
 */
export const decodeAddDomainSearch =
  Schema.decodeUnknownSync(AddDomainSearchInUrl);

/** In place of a Domains page before the person has an Organization. */
export const DOMAINS_NEED_AN_ORGANIZATION =
  "Sending domains belong to an organization. Name yours on Home first.";
