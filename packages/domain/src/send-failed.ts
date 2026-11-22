import { Schema } from "effect";

/**
 * Why an email couldn't be handed to the Provider:
 *
 * - `blocked`: the host resolves to an address this deployment doesn't
 *   connect to, such as a private network on the hosted service.
 * - `host-not-found`: the host has no address.
 * - `unreachable`: no connection, or the server stopped answering.
 * - `tls`: the connection couldn't be encrypted as configured.
 * - `auth`: the server refused the credentials.
 * - `rejected`: the server refused the sender, a recipient or the message.
 * - `unavailable`: this deployment can't send through this Provider yet.
 * - `failed`: anything else.
 */
export const SendFailureReasonSchema = Schema.Literals([
  "blocked",
  "host-not-found",
  "unreachable",
  "tls",
  "auth",
  "rejected",
  "unavailable",
  "failed",
]);

export type SendFailureReason = typeof SendFailureReasonSchema.Type;

/**
 * The Provider didn't accept the email. `detail` is what went wrong in the
 * Provider's or the network's words, such as the SMTP server's reply, so the
 * person who configured the connection can fix it. It never holds
 * credentials.
 */
// oxlint-disable-next-line unicorn/throw-new-error -- Schema.TaggedError is a class factory, not an Error constructor.
export class SendFailed extends Schema.TaggedError<SendFailed>()("SendFailed", {
  reason: SendFailureReasonSchema,
  detail: Schema.String,
}) {}
