import { Schema } from "effect";

/**
 * Where an SES Provider Connection's SNS topic posts its bounces and
 * complaints. The URL carries a signed token naming the connection, so it
 * is a secret: anyone with it can post messages SNS signed to it.
 */
export class SesNotificationsUrl extends Schema.Class<SesNotificationsUrl>(
  "SesNotificationsUrl"
)({
  url: Schema.String,
}) {}
