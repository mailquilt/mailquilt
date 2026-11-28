/** What a delivery status report says about its one recipient. */
export interface ReportedDelivery {
  readonly action: "failed" | "delayed" | "delivered";
  readonly status: string;
  /** Who the report is about (`Final-Recipient`); `gone@example.com` unless given. */
  readonly recipient?: string;
  /** The address the email was sent to, when the server changed it, such as an alias (`Original-Recipient`). */
  readonly originalRecipient?: string;
  /** Whether the server adds comments to the fields, as RFC 3464 allows, such as `failed (permanent \) failure)`, with an escaped parenthesis. */
  readonly comments?: boolean;
}

const BOUNDARY = "report-boundary";

/**
 * A bounce as a receiving server sends it: a delivery status report (RFC
 * 3464) about one recipient, with the human-readable part first and the
 * returned headers last; with `global`, in the format for internationalized
 * email (RFC 6533).
 */
export const deliveryStatusReport = (
  delivery: ReportedDelivery,
  options: { readonly global?: boolean } = {}
) => {
  const reportType =
    options.global === true ? "global-delivery-status" : "delivery-status";

  return [
    "From: Mail Delivery System <MAILER-DAEMON@mx.example.net>",
    "Subject: Undelivered Mail Returned to Sender",
    "MIME-Version: 1.0",
    `Content-Type: multipart/report; report-type=${reportType};\r\n\tboundary="${BOUNDARY}"`,
    "",
    `--${BOUNDARY}`,
    "Content-Type: text/plain; charset=us-ascii",
    "",
    "Your message could not be delivered.",
    "",
    `--${BOUNDARY}`,
    `Content-Type: message/${reportType}`,
    "",
    "Reporting-MTA: dns; mx.example.net",
    "",
    ...(delivery.originalRecipient === undefined
      ? []
      : [`Original-Recipient: rfc822;${delivery.originalRecipient}`]),
    `Final-Recipient: rfc822; ${delivery.recipient ?? "gone@example.com"}${delivery.comments === true ? " (the mailbox)" : ""}`,
    `Action: ${delivery.action}${delivery.comments === true ? " (permanent \\) failure)" : ""}`,
    `Status: ${delivery.status}`,
    `Diagnostic-Code: smtp; 550 ${delivery.status} the mailbox said no`,
    "",
    `--${BOUNDARY}`,
    "Content-Type: text/rfc822-headers",
    "",
    "Subject: Our autumn menu",
    "",
    `--${BOUNDARY}--`,
    "",
  ].join("\r\n");
};

/** An out-of-office reply, which mail apps send to the Return-Path too (RFC 3834). */
export const AUTO_REPLY = [
  "From: Sam <sam@example.com>",
  "Subject: Out of office",
  "Auto-Submitted: auto-replied",
  "Content-Type: text/plain",
  "",
  "I'm away until Monday. Status: 5.1.1 Action: failed",
  "",
].join("\r\n");

/**
 * A spam complaint in the Abuse Reporting Format, which is a report but not a
 * delivery status one, though a quoted parameter with an escaped quote, and
 * its boundary, both hold `report-type=delivery-status`, and it carries a
 * delivery status part.
 */
export const COMPLAINT_REPORT = [
  "From: abuse@mx.example.net",
  "Subject: Complaint",
  "MIME-Version: 1.0",
  'Content-Type: multipart/report; x-note="prefix\\";report-type=delivery-status;end"; report-type=feedback-report; boundary="report-type=delivery-status"',
  "",
  "--report-type=delivery-status",
  "Content-Type: text/plain",
  "",
  "A complaint.",
  "--report-type=delivery-status",
  "Content-Type: message/delivery-status",
  "",
  "Final-Recipient: rfc822; gone@example.com",
  "Action: failed",
  "Status: 5.1.1",
  "",
  "--report-type=delivery-status--",
  "",
].join("\r\n");
