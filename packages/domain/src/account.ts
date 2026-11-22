import { Schema } from "effect";

/**
 * The shortest password a new account may have. Better Auth enforces it on
 * the server, and the sign-up form checks it before sending.
 */
export const MIN_PASSWORD_LENGTH = 8;

/** The pattern browsers check an `<input type="email">` against. */
export const BROWSER_EMAIL_INPUT_PATTERN =
  /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/u;

/** The address someone signs up and signs in with. */
export const EmailAddress = Schema.String.check(
  Schema.isNonEmpty({ message: "Enter your email address." }),
  Schema.isPattern(BROWSER_EMAIL_INPUT_PATTERN, {
    message: "Enter an email address like name@example.com.",
  })
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
  })
);
