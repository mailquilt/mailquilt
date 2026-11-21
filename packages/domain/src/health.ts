import { Schema } from "effect";

/** The app is up and can query its Postgres database. */
export class Health extends Schema.Class<Health>("Health")({
  database: Schema.Literal("connected"),
}) {}
