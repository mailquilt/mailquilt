import { MIN_PASSWORD_LENGTH } from "@repo/domain";
import { createAuthClient } from "better-auth/react";

/**
 * Better Auth's client for the endpoints our router allows, on the origin
 * that served the dashboard.
 */
export const authClient = createAuthClient({ basePath: "/api/auth" });

/** Where the verification link lands after Better Auth checks it. */
export const EMAIL_VERIFIED_PATH = "/email-verified";

interface AuthError {
  readonly status: number;
  readonly code?: string | undefined;
}

/** Shown when an auth request fails before Mailquilt answers it. */
export const UNREACHABLE_MESSAGE =
  "Mailquilt couldn’t be reached. Check your connection, then try again.";

/**
 * What to tell the person about a failed auth request. Sign-in never says
 * whether the email or the password was wrong.
 */
export const authErrorMessage = (error: AuthError) => {
  if (error.status === 429) {
    return "Too many attempts. Try again later.";
  }

  if (error.code === "INVALID_EMAIL_OR_PASSWORD") {
    return "The email or password is incorrect.";
  }

  if (error.code === "PASSWORD_TOO_SHORT") {
    return `Use a password of at least ${MIN_PASSWORD_LENGTH} characters.`;
  }

  return "Something went wrong. Try again.";
};
