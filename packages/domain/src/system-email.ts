/**
 * The subject of the email that verifies a new account's address. The
 * dashboard searches the inbox for it, so the mailer and the dashboard must
 * share this one value.
 */
export const VERIFICATION_EMAIL_SUBJECT =
  "Verify your email address for Mailquilt";

/**
 * The subject of a test email sent through a Provider Connection. The
 * dashboard tells people to look for it, so both share this one value.
 */
export const TEST_EMAIL_SUBJECT = "Mailquilt test email";

/**
 * How many test emails one person may send, across Organizations, and in
 * how many minutes. The API enforces it and the dashboard quotes it.
 */
export const TEST_EMAIL_LIMIT = { max: 10, minutes: 10 } as const;
