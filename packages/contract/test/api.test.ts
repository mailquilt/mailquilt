import { HttpApi } from "effect/http-api";
import { describe, expect, it } from "vitest";

import { MailquiltApi } from "../src/index.ts";

const pathsOutsideApi = () => {
  const outside: string[] = [];
  HttpApi.reflect(MailquiltApi, {
    onEndpoint: ({ endpoint }) => {
      if (endpoint.path !== "/health" && !endpoint.path.startsWith("/api/")) {
        outside.push(endpoint.path);
      }
    },
    onGroup: () => null,
  });

  return outside;
};

describe("public API", () => {
  it("serves every endpoint except /health under /api", () => {
    expect(pathsOutsideApi()).toStrictEqual([]);
  });
});
