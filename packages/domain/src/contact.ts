import { Schema } from "effect";

import { BROWSER_EMAIL_INPUT_PATTERN } from "./account.ts";
import { ContactIdSchema } from "./ids.ts";

const MAX_SMTP_ADDRESS_LENGTH = 254;

/**
 * A Contact's email address. Spaces around it are trimmed. It is kept as
 * entered, and compared without regard to case: one Organization can't have
 * two Contacts whose addresses differ only in case.
 */
export const ContactEmail = Schema.Trim.check(
  Schema.isNonEmpty({ message: "Enter an email address." }),
  Schema.isMaxLength(MAX_SMTP_ADDRESS_LENGTH, {
    message: `Use at most ${MAX_SMTP_ADDRESS_LENGTH} characters.`,
  }),
  Schema.isPattern(BROWSER_EMAIL_INPUT_PATTERN, {
    message: "Enter an email address like name@example.com.",
  })
);

/** One person in an Organization, identified by their email address. */
export class Contact extends Schema.Class<Contact>("Contact")({
  id: ContactIdSchema,
  email: ContactEmail,
}) {}
