import { describe, expect, it } from "vitest";

import { logMessage } from "./log-message.ts";

describe("Better Auth log messages", () => {
  it.each([
    [
      "Invalid callbackURL: https://untrusted.example/?email=ada@example.com",
      "Invalid callbackURL",
    ],
    ["Invalid origin: https://ada@example.com", "Invalid origin"],
    ["Failed to create user", "Failed to create user"],
  ])("logs %j as %j", (message, logged) => {
    expect(logMessage(message)).toBe(logged);
  });
});
