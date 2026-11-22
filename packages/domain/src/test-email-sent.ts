import { Schema } from "effect";

/** A test email the Provider accepted, with the ID it gave the message. */
export class TestEmailSent extends Schema.Class<TestEmailSent>("TestEmailSent")(
  {
    messageId: Schema.String,
  }
) {}
