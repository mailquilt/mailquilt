import { Schema } from "effect";

/** The time a member chose to send a Campaign at has already passed. */
// oxlint-disable-next-line unicorn/throw-new-error -- Schema.TaggedError is a class factory, not an Error constructor.
export class ScheduleInPast extends Schema.TaggedError<ScheduleInPast>()(
  "ScheduleInPast",
  {}
) {}
