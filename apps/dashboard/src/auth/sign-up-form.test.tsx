import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { SignUpForm } from "./sign-up-form.tsx";

const api = setupServer();

const fillAndSubmit = () => {
  fireEvent.change(screen.getByLabelText("Your name"), {
    target: { value: "Ada" },
  });
  fireEvent.change(screen.getByLabelText("Email"), {
    target: { value: "ada@example.com" },
  });
  fireEvent.change(screen.getByLabelText("Password"), {
    target: { value: "correct horse battery staple" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Create account" }));
};

describe("sign-up form", () => {
  beforeAll(() => api.listen({ onUnhandledFrame: "error" }));
  afterEach(() => {
    cleanup();
    api.resetHandlers();
  });

  afterAll(() => api.close());

  it("hands over to the inbox step once the account exists", async () => {
    let callbackURL: unknown;
    let signedUpAs: unknown;
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
        <SignUpForm
          onSignedUp={(email) => {
            signedUpAs = email;
          }}
        />
      </QueryClientProvider>
    );
    fillAndSubmit();

    await expect.poll(() => signedUpAs).toBe("ada@example.com");
    expect(callbackURL).toBe("/email-verified");
  });

  it("says Mailquilt couldn't be reached when the request never arrives", async () => {
    api.use(http.post("*/api/auth/sign-up/email", () => HttpResponse.error()));

    render(
      <QueryClientProvider client={new QueryClient()}>
        <SignUpForm onSignedUp={() => {}} />
      </QueryClientProvider>
    );
    fillAndSubmit();

    await expect(
      screen.findByText(
        "Mailquilt couldn’t be reached. Check your connection, then try again."
      )
    ).resolves.toBeDefined();
  });
});
