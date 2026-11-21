import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { EmailVerified } from "./email-verified.tsx";

describe("email verified page", () => {
  afterEach(cleanup);

  it("confirms the email address once Better Auth has verified it", () => {
    render(<EmailVerified />);

    expect(
      screen.getByRole("heading", { name: "Your email address is verified" })
    ).toBeDefined();
  });

  it("asks for a new link when the one used has expired or isn't valid", () => {
    render(<EmailVerified error="TOKEN_EXPIRED" />);

    expect(
      screen.getByRole("heading", { name: "This link no longer works" })
    ).toBeDefined();
    expect(screen.getByRole("link", { name: "Sign in" })).toBeDefined();
  });
});
