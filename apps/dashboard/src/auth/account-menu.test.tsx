import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { AccountMenu } from "./account-menu.tsx";

const api = setupServer();

const SESSION = {
  session: { expiresAt: "2026-12-01T00:00:00.000Z", id: "s", userId: "u" },
  user: { email: "ada@example.com", emailVerified: true, id: "u", name: "Ada" },
};

describe("account menu", () => {
  beforeAll(() => api.listen({ onUnhandledFrame: "error" }));
  afterEach(() => {
    cleanup();
    api.resetHandlers();
  });

  afterAll(() => api.close());

  it("signs the person out", async () => {
    let signedIn = true;
    api.use(
      http.get("*/api/auth/get-session", () =>
        HttpResponse.json(signedIn ? SESSION : null)
      ),
      http.post("*/api/auth/sign-out", () => {
        signedIn = false;

        return HttpResponse.json({ success: true });
      })
    );

    render(<AccountMenu />);
    await expect(screen.findByText("ada@example.com")).resolves.toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));

    await expect(
      screen.findByRole("link", { name: "Sign in" })
    ).resolves.toBeDefined();
    expect(signedIn).toBeFalsy();
  });
});
