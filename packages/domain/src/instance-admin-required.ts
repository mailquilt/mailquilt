import { Schema } from "effect";

/** Only the instance admin can see or change the install's settings. */
// oxlint-disable-next-line unicorn/throw-new-error -- Schema.TaggedError is a class factory, not an Error constructor.
export class InstanceAdminRequired extends Schema.TaggedError<InstanceAdminRequired>()(
  "InstanceAdminRequired",
  {}
) {}
