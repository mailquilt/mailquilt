import { BounceReports } from "@repo/core";
import type { BounceKind } from "@repo/core";
import { Effect, Layer, Option, Schema } from "effect";
import PostalMime from "postal-mime";

// WARNING: only a delivery status report counts; a feedback report (a complaint) or an auto-reply that quotes a status mustn't Suppress anyone.
const DELIVERY_STATUS_REPORT =
  /^multipart\/report\s*;.*\breport-type\s*=\s*"?(?:global-)?delivery-status"?/isu;

const STATUS_TYPES = new Set([
  "message/delivery-status",
  "message/global-delivery-status",
]);

const FIELD = /^(?<name>[\w-]+)\s*:\s*(?<value>.*)$/u;

const FOLDED = /\r?\n[ \t]+/gu;

const STATUS = /^(?<kind>[45])\.\d{1,3}\.\d{1,3}\b/u;

// WARNING: a full mailbox is reported as permanent (5.2.2), but it empties; most senders treat it as a soft bounce, and so does Mailquilt.
const MAILBOX_FULL = "5.2.2";

// WARNING: with `attachmentEncoding: "utf8"` postal-mime gives a part's content as text, though its type also allows bytes.
const decodeText = Schema.decodeUnknownOption(Schema.String);

const BLANK_LINE = /\r?\n\s*\r?\n/u;

const LINE_BREAK = /\r?\n/u;

const fieldGroupsOf = (text: string) =>
  text
    .replaceAll(FOLDED, " ")
    .split(BLANK_LINE)
    .map(
      (group) =>
        new Map(
          group.split(LINE_BREAK).flatMap((line) => {
            const field = FIELD.exec(line)?.groups;

            return field === undefined
              ? []
              : [[field.name?.toLowerCase() ?? "", field.value?.trim() ?? ""]];
          })
        )
    );

const kindOf = (status: string) => {
  const code = STATUS.exec(status);

  if (code === null) {
    return Option.none<BounceKind>();
  }

  return Option.some<BounceKind>(
    code.groups?.kind === "5" && !status.startsWith(MAILBOX_FULL)
      ? "hard-bounce"
      : "soft-bounce"
  );
};

const bounceKindOf = (statusText: string) => {
  const failed = fieldGroupsOf(statusText).find(
    (fields) => fields.get("action")?.toLowerCase() === "failed"
  );

  return Option.flatMap(Option.fromUndefinedOr(failed?.get("status")), kindOf);
};

const read = (raw: Uint8Array) =>
  Effect.tryPromise(() =>
    PostalMime.parse(raw, {
      // oxlint-disable-next-line unicorn/text-encoding-identifier-case -- postal-mime's option takes "utf8", not the encoding's name.
      attachmentEncoding: "utf8",
    })
  ).pipe(
    Effect.map((email) => {
      const contentType = email.headers.find(
        (header) => header.key === "content-type"
      );

      if (!DELIVERY_STATUS_REPORT.test(contentType?.value ?? "")) {
        return Option.none<BounceKind>();
      }

      const part = email.attachments.find((attachment) =>
        STATUS_TYPES.has(attachment.mimeType.toLowerCase())
      );

      if (part === undefined) {
        return Option.none<BounceKind>();
      }

      return Option.flatMap(decodeText(part.content), bounceKindOf);
    }),
    Effect.orElseSucceed(() => Option.none<BounceKind>())
  );

/**
 * Reads bounces with `postal-mime`: a `multipart/report` whose report type
 * is `delivery-status`, classified by its first failed recipient. Action
 * `failed` with a 5.x.x status is a hard bounce, except 5.2.2 (mailbox
 * full); with 4.x.x, or 5.2.2, a soft bounce. A message that doesn't parse
 * is `None`.
 */
export const BounceReportsLive = Layer.succeed(BounceReports, { read });
