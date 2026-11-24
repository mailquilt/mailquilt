import { Schema } from "effect";

import { ListIdSchema, ProviderConnectionIdSchema } from "./ids.ts";
import { MailAddress, Sender } from "./provider-connection.ts";

const MAX_SUBJECT_LENGTH = 200;

/**
 * The longest HTML a Campaign holds, in characters. The API refuses a request
 * body over 64 KiB, and JSON escapes every quote in the HTML, so this leaves
 * room for the escaping and the other fields.
 */
export const MAX_CAMPAIGN_HTML_LENGTH = 50_000;

/** A Campaign's subject line. Spaces around it are trimmed. */
export const CampaignSubject = Schema.Trim.check(
  Schema.isNonEmpty({ message: "Enter a subject." }),
  Schema.isMaxLength(MAX_SUBJECT_LENGTH, {
    message: `Use at most ${MAX_SUBJECT_LENGTH} characters.`,
  })
);

/** A Campaign's content: the email's HTML, as written. */
export const CampaignHtml = Schema.String.check(
  Schema.isNonEmpty({ message: "Paste the email’s HTML." }),
  Schema.isMaxLength(MAX_CAMPAIGN_HTML_LENGTH, {
    message: `Use at most ${MAX_CAMPAIGN_HTML_LENGTH.toLocaleString("en-US")} characters.`,
  })
);

/**
 * Where a Campaign is: a `draft` can be changed and sent; `sending` once a
 * member sent it, while its emails go out; `sent` once every Contact it went
 * to was sent it, or the Provider refused it.
 */
export const CampaignStatusSchema = Schema.Literals([
  "draft",
  "sending",
  "sent",
]);

export type CampaignStatus = typeof CampaignStatusSchema.Type;

/**
 * What a member writes into a Campaign: its subject, who it's from and who
 * replies go to, the one List it goes to, the Provider Connection it's sent
 * through, and its HTML.
 */
export const CampaignDraft = Schema.Struct({
  subject: CampaignSubject,
  from: Sender,
  replyTo: Schema.optionalKey(MailAddress),
  listId: ListIdSchema,
  providerConnectionId: ProviderConnectionIdSchema,
  html: CampaignHtml,
});
