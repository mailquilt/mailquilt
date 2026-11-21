import { betterAuth } from "better-auth/minimal";
import { Redacted } from "effect";

import { TEST_AUTH_SECRET } from "./harness.ts";

interface BetterAuthEndpoint {
  readonly method: string;
  readonly path: string;
}

/** Every endpoint the installed Better Auth serves, by method and path. */
export const betterAuthEndpoints = () => {
  const auth = betterAuth({
    baseURL: "http://better-auth.test",
    emailAndPassword: { enabled: true },
    secret: Redacted.value(TEST_AUTH_SECRET),
    telemetry: { enabled: false },
  });

  return Object.values(auth.api).flatMap(({ options, path }) =>
    path === undefined
      ? []
      : [options.method]
          .flat()
          .map((method) => ({ method, path }) satisfies BetterAuthEndpoint)
  );
};
