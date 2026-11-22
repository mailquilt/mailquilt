import { Schema } from "effect";

/**
 * The System Mailer is set by environment variables, which win over the
 * instance settings, so it can't be changed from the API.
 */
// oxlint-disable-next-line unicorn/throw-new-error -- Schema.TaggedError is a class factory, not an Error constructor.
export class SystemMailerFromEnvironment extends Schema.TaggedError<SystemMailerFromEnvironment>()(
  "SystemMailerFromEnvironment",
  {}
) {}
