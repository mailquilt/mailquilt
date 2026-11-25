import { Schema } from "effect";

/**
 * The shortest password a new account may have. Better Auth enforces it on
 * the server, and the sign-up form checks it before sending.
 */
export const MIN_PASSWORD_LENGTH = 8;

/**
 * The longest password Better Auth accepts, at sign-up and at every
 * sign-in, so no account, the instance admin's included, can be made with a
 * password that can't sign in.
 */
export const MAX_PASSWORD_LENGTH = 128;

/**
 * The error code sign-up answers with when it isn't open: before first-run
 * setup, or while the install is invite-only. The dashboard reads it.
 */
export const SIGN_UP_CLOSED = "SIGN_UP_CLOSED";

/** The pattern browsers check an `<input type="email">` against. */
export const BROWSER_EMAIL_INPUT_PATTERN =
  /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/u;

// WARNING: Zod 4.6's `z.email()` pattern, which Better Auth checks at every sign-up and sign-in. An address it refuses, such as admin@localhost, can never sign in; packages/api/test/auth.test.ts fails if an upgrade moves its rule.
const BETTER_AUTH_EMAIL_PATTERN =
  /^(?:[A-Za-z0-9_'+-]+\.)*[A-Za-z0-9_'+-]*[A-Za-z0-9_+-]@(?:[A-Za-z0-9][A-Za-z0-9-]*\.)+[A-Za-z]{2,}$/u;

/**
 * The address someone signs up and signs in with. It must pass both the
 * browser's check and Better Auth's, so first-run setup can't make an
 * instance admin who can never sign in.
 */
export const EmailAddress = Schema.String.check(
  Schema.isNonEmpty({ message: "Enter your email address." }),
  Schema.makeFilter(
    (email) =>
      BROWSER_EMAIL_INPUT_PATTERN.test(email) &&
      BETTER_AUTH_EMAIL_PATTERN.test(email),
    { message: "Enter an email address like name@example.com." }
  )
);

/** What a person calls themselves on their account. */
export const PersonName = Schema.String.check(
  Schema.isNonEmpty({ message: "Enter your name." })
);

/** The password someone signs in with. */
export const Password = Schema.String.check(
  Schema.isNonEmpty({ message: "Enter your password." })
);

/** A password for a new account. */
export const NewPassword = Schema.String.check(
  Schema.isMinLength(MIN_PASSWORD_LENGTH, {
    message: `Use a password of at least ${MIN_PASSWORD_LENGTH} characters.`,
  }),
  Schema.isMaxLength(MAX_PASSWORD_LENGTH, {
    message: `Use a password of at most ${MAX_PASSWORD_LENGTH} characters.`,
  })
);
