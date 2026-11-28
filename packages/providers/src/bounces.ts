import { BounceReports } from "@repo/core";
import type { BounceKind, FailedDelivery } from "@repo/core";
import { Effect, Layer, Option, Schema } from "effect";
import PostalMime from "postal-mime";

const REPORT_TYPES = new Set(["delivery-status", "global-delivery-status"]);

// WARNING: split outside quotes, and a backslash escapes the character after it inside them (RFC 822's quoted-pair), so a quoted value such as `"a\";report-type=delivery-status"` is never read as a parameter of its own.
const splitOutsideQuotes = (value: string) => {
  const parts = [""];
  let quoted = false;
  let escaped = false;

  for (const character of value) {
    if (escaped) {
      escaped = false;
    } else if (quoted && character === "\\") {
      escaped = true;
    } else if (character === '"') {
      quoted = !quoted;
    }

    if (character === ";" && !quoted) {
      parts.push("");
    } else {
      parts[parts.length - 1] += character;
    }
  }

  return parts;
};

// WARNING: only a delivery status report counts; a feedback report (a complaint) or an auto-reply that quotes a status mustn't Suppress anyone.
const isDeliveryStatusReport = (contentType: string) => {
  const [type = "", ...parameters] = splitOutsideQuotes(contentType);

  const reportType = parameters
    .map((parameter) => parameter.split("="))
    .find(([name]) => name?.trim().toLowerCase() === "report-type")?.[1];

  return (
    type.trim().toLowerCase() === "multipart/report" &&
    REPORT_TYPES.has(reportType?.trim().replaceAll('"', "").toLowerCase() ?? "")
  );
};

// WARNING: RFC 3464's fields may carry comments in parentheses, such as `failed (permanent failure)`; they're left out before a value is read, except inside quotes, and a backslash escapes the character after it, as in `(permanent \\) failure)`.
const withoutComments = (value: string) => {
  let kept = "";
  let depth = 0;
  let quoted = false;
  let escaped = false;

  for (const character of value) {
    if (escaped) {
      escaped = false;

      if (depth === 0) {
        kept += character;
      }
    } else if ((quoted || depth > 0) && character === "\\") {
      escaped = true;

      if (depth === 0) {
        kept += character;
      }
    } else if (character === '"' && depth === 0) {
      quoted = !quoted;
      kept += character;
    } else if (!quoted && character === "(") {
      depth += 1;
    } else if (!quoted && character === ")" && depth > 0) {
      depth -= 1;
    } else if (depth === 0) {
      kept += character;
    }
  }

  return kept.trim();
};

const STATUS_TYPES = new Set([
  "message/delivery-status",
  "message/global-delivery-status",
]);

const FIELD = /^(?<name>[\w-]+)\s*:\s*(?<value>.*)$/u;

const FOLDED = /\r?\n[ \t]+/gu;

const STATUS = /^(?<kind>[45])\.(?<subject>\d{1,3})\.\d{1,3}\b/u;

// WARNING: a full mailbox is reported as permanent (5.2.2), but it empties; most senders treat it as a soft bounce, and so does Mailquilt.
const MAILBOX_FULL = "5.2.2";

// WARNING: a 5.7.x status is a refusal by security or policy (RFC 3463), such as a block on the sending server's reputation, not a sign the address is gone; as a hard bounce it would Suppress every recipient at that provider for good.
const POLICY = "7";

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
              : [
                  [
                    field.name?.toLowerCase() ?? "",
                    withoutComments(field.value ?? ""),
                  ],
                ];
          })
        )
    );

const kindOf = (status: string) => {
  const code = STATUS.exec(status);

  if (code === null) {
    return Option.none<BounceKind>();
  }

  return Option.some<BounceKind>(
    code.groups?.kind === "5" &&
      code.groups.subject !== POLICY &&
      !status.startsWith(MAILBOX_FULL)
      ? "hard-bounce"
      : "soft-bounce"
  );
};

// WARNING: an address type such as `rfc822;` comes first, and some servers wrap the address in angle brackets.
const ADDRESS = /;\s*<?(?<address>[^<>\s]+)>?\s*$/u;

const failedDeliveriesOf = (statusText: string) =>
  fieldGroupsOf(statusText).flatMap((fields) => {
    if (fields.get("action")?.toLowerCase() !== "failed") {
      return [];
    }

    const recipient = ADDRESS.exec(fields.get("final-recipient") ?? "")?.groups
      ?.address;

    const kind = kindOf(fields.get("status") ?? "");

    if (recipient === undefined || Option.isNone(kind)) {
      return [];
    }

    return [{ kind: kind.value, recipient } satisfies FailedDelivery];
  });

const NO_FAILED_DELIVERIES: readonly FailedDelivery[] = [];

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

      if (!isDeliveryStatusReport(contentType?.value ?? "")) {
        return [];
      }

      const part = email.attachments.find((attachment) =>
        STATUS_TYPES.has(attachment.mimeType.toLowerCase())
      );

      if (part === undefined) {
        return [];
      }

      return Option.match(decodeText(part.content), {
        onNone: () => [],
        onSome: failedDeliveriesOf,
      });
    }),
    Effect.orElseSucceed(() => NO_FAILED_DELIVERIES)
  );

/**
 * Reads bounces with `postal-mime`: a `multipart/report` whose report type
 * is `delivery-status`, giving each recipient with Action `failed`, by its
 * `Final-Recipient`. A 5.x.x status is a hard bounce, except 5.2.2 (mailbox
 * full) and 5.7.x (refused by policy); 4.x.x, 5.2.2 or 5.7.x is a soft
 * bounce. A recipient without an address or a status, and a message that
 * doesn't parse, give none.
 */
export const BounceReportsLive = Layer.succeed(BounceReports, { read });
