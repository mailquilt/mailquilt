import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { SignUpForm } from "./sign-up-form.tsx";

const api = setupServer();

describe("sign-up form", () => {
  beforeAll(() => api.listen({ onUnhandledFrame: "error" }));
  afterEach(() => {
    cleanup();
    api.resetHandlers();
  });

  afterAll(() => api.close());

  it("asks the person to open the link sent to their email", async () => {
    let callbackURL: unknown;
    api.use(
      http.post("*/api/auth/sign-up/email", async ({ request }) => {
        // SAFETY: the sign-up form sends Better Auth a JSON body.
        ({ callbackURL } = (await request.json()) as {
          callbackURL: string;
        });

        return HttpResponse.json({ token: null, user: {} });
      })
    );

    render(
      <QueryClientProvider client={new QueryClient()}>
        <SignUpForm />
      </QueryClientProvider>
    );
    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: "Ada" },
    });
    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "ada@example.com" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "correct horse battery staple" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));

    await expect(
      screen.findByText(
        "We sent a link to ada@example.com. Open it to verify your email address, then sign in."
      )
    ).resolves.toBeDefined();
    expect(callbackURL).toBe("/email-verified");
  });
});
