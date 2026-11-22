import { Schema } from "effect";

import { Contact } from "./contact.ts";
import { Count } from "./count.ts";
import { ContactIdSchema } from "./ids.ts";

/** How many items one page of a long collection holds (ADR 0008). */
export const PAGE_SIZE = 50;

/**
 * One page of an Organization's Contacts, newest first (ADR 0008). `total`
 * counts every Contact the filters match, and `start` is how many of them
 * come before this page. `previous` and `next` are the cursors for the pages
 * either side, or null at either end.
 */
export class ContactPage extends Schema.Class<ContactPage>("ContactPage")({
  contacts: Schema.Array(Contact),
  total: Count,
  start: Count,
  previous: Schema.NullOr(ContactIdSchema),
  next: Schema.NullOr(ContactIdSchema),
}) {}
