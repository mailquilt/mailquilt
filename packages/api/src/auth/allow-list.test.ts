import { describe, expect, it } from "vitest";

import { betterAuthEndpoints } from "../../test/better-auth-endpoints.ts";
import { DISABLED_AUTH_PATHS, isAllowedAuthEndpoint } from "./allow-list.ts";

describe("Better Auth allow list", () => {
  it("disables every Better Auth path the router forwards no method of", () => {
    const endpoints = betterAuthEndpoints();

    const forwardedPaths = new Set(
      endpoints
        .filter(({ method, path }) => isAllowedAuthEndpoint(method, path))
        .map(({ path }) => path)
    );

    const unforwardedPaths = new Set(
      endpoints
        .map(({ path }) => path)
        .filter((path) => !forwardedPaths.has(path))
    );

    expect([...unforwardedPaths].toSorted()).toStrictEqual(
      DISABLED_AUTH_PATHS.toSorted()
    );
  });
});
