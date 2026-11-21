import { Schema } from "effect";

/** Postgres could not be queried. The cause is logged, never returned. */
// oxlint-disable-next-line unicorn/throw-new-error -- Schema.TaggedError is a class factory, not an Error constructor.
export class DatabaseUnreachable extends Schema.TaggedError<DatabaseUnreachable>()(
  "DatabaseUnreachable",
  {}
) {}
