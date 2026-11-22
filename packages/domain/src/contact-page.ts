import { Schema } from "effect";

import { Contact } from "./contact.ts";
import { ContactIdSchema } from "./ids.ts";

/**
 * One page of an Organization's Contacts, newest first. `next` is the cursor
 * for the following page, or null on the last one (ADR 0008).
 */
export class ContactPage extends Schema.Class<ContactPage>("ContactPage")({
  contacts: Schema.Array(Contact),
  next: Schema.NullOr(ContactIdSchema),
}) {}
