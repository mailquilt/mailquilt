/** Better Auth is mounted here (ADR 0004). */
export const AUTH_BASE_PATH = "/api/auth";

/**
 * The Better Auth endpoints Mailquilt uses, by method and path below
 * `AUTH_BASE_PATH`. Our router forwards only these; every other request
 * returns 404 before it reaches Better Auth.
 */
export const ALLOWED_AUTH_ENDPOINTS = [
  { method: "POST", path: "/sign-up/email" },
  { method: "POST", path: "/sign-in/email" },
  { method: "POST", path: "/sign-out" },
  { method: "GET", path: "/get-session" },
  { method: "GET", path: "/verify-email" },
  { method: "POST", path: "/send-verification-email" },
] as const;

export const isAllowedAuthEndpoint = (method: string, path: string) =>
  ALLOWED_AUTH_ENDPOINTS.some(
    (endpoint) => endpoint.method === method && endpoint.path === path
  );

/**
 * Every other endpoint Better Auth 1.7 serves, so Better Auth refuses them
 * too if a request ever gets past our router. A test fails when a Better Auth
 * upgrade adds an endpoint that is on neither list.
 */
export const DISABLED_AUTH_PATHS = [
  "/account-info",
  "/callback/:id",
  "/change-email",
  "/change-password",
  // WARNING: deleting a user cascades to their memberships and can leave an Organization with no owner; fix #115 before allowing /delete-user.
  "/delete-user",
  "/delete-user/callback",
  "/error",
  "/get-access-token",
  "/link-social",
  "/list-accounts",
  "/list-sessions",
  "/ok",
  "/refresh-token",
  "/request-password-reset",
  "/reset-password",
  "/reset-password/:token",
  "/revoke-other-sessions",
  "/revoke-session",
  "/revoke-sessions",
  "/sign-in/social",
  "/unlink-account",
  "/update-session",
  "/update-user",
  "/verify-password",
];
