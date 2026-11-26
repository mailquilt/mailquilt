import { Effect, Schema } from "effect";

import { ListIdSchema, ProviderConnectionIdSchema } from "./ids.ts";
import { MailAddress, Sender } from "./provider-connection.ts";

const MAX_SUBJECT_LENGTH = 200;

/**
 * The most a Campaign's HTML may take in a request: 60 KiB as a JSON string
 * in UTF-8. The API refuses a request body over 64 KiB, and the rest of a
 * draft fits in what's left.
 */
export const MAX_CAMPAIGN_HTML_BYTES = 60 * 1024;

const ONE_BYTE = 0x80;

const TWO_BYTES = 0x8_00;

const THREE_BYTES = 0x1_00_00;

const utf8Bytes = (codePoint: number) => {
  if (codePoint < ONE_BYTE) {
    return 1;
  }

  if (codePoint < TWO_BYTES) {
    return 2;
  }

  return codePoint < THREE_BYTES ? 3 : 4;
};

/** How many bytes `html` takes in a request: as a JSON string, in UTF-8. */
export const campaignHtmlBytes = (html: string) => {
  let bytes = 0;

  for (const character of JSON.stringify(html)) {
    bytes += utf8Bytes(character.codePointAt(0) ?? 0);
  }

  return bytes;
};

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
  Schema.makeFilter(
    (html) => campaignHtmlBytes(html) <= MAX_CAMPAIGN_HTML_BYTES,
    { message: "The HTML is too large to save. Keep it under 60 KB." }
  )
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
 * The most Lists a Campaign can go to, and the most it can leave out. Both
 * full fit in a request beside 60 KiB of HTML.
 */
export const MAX_CAMPAIGN_LISTS = 25;

const atMostCampaignLists = Schema.isMaxLength(MAX_CAMPAIGN_LISTS, {
  message: `Choose at most ${MAX_CAMPAIGN_LISTS} lists.`,
});

const eachOnce = Schema.isUnique({ message: "Choose each list once." });

/** The Lists a Campaign goes to: at least one, each once. */
export const CampaignListIds = Schema.Array(ListIdSchema).check(
  Schema.isMinLength(1, { message: "Choose at least one list." }),
  atMostCampaignLists,
  eachOnce
);

/** The Lists whose Contacts a Campaign leaves out, each once; none is fine. */
export const ExcludedListIds = Schema.Array(ListIdSchema).check(
  atMostCampaignLists,
  eachOnce
);

const neverBoth = Schema.makeFilter(
  (lists: {
    readonly listIds: readonly string[];
    readonly excludedListIds: readonly string[];
  }) => !lists.excludedListIds.some((id) => lists.listIds.includes(id)),
  { message: "A list can’t be both sent to and left out." }
);

/**
 * Who a Campaign goes to: every Contact with a subscribed Subscription to
 * any of `listIds`, once, except anyone with a Subscription to one of
 * `excludedListIds`, whatever its status. A List can't be in both.
 * `excludedListIds` may be left out for none.
 */
export const CampaignLists = Schema.Struct({
  listIds: CampaignListIds,
  excludedListIds: ExcludedListIds.pipe(
    Schema.withDecodingDefaultKey(Effect.succeed([]))
  ),
}).check(neverBoth);

/**
 * What a member writes into a Campaign: its subject, who it's from and who
 * replies go to, the Lists it goes to and leaves out (`CampaignLists`), the
 * Provider Connection it's sent through, and its HTML.
 */
export const CampaignDraft = Schema.Struct({
  subject: CampaignSubject,
  from: Sender,
  replyTo: Schema.optionalKey(MailAddress),
  ...CampaignLists.fields,
  providerConnectionId: ProviderConnectionIdSchema,
  html: CampaignHtml,
}).check(neverBoth);
