import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { SignInForm } from "./sign-in-form.tsx";

const api = setupServer();

const renderSignInForm = () =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <SignInForm />
    </QueryClientProvider>
  );

const submit = () => {
  fireEvent.change(screen.getByLabelText("Email"), {
    target: { value: "ada@example.com" },
  });
  fireEvent.change(screen.getByLabelText("Password"), {
    target: { value: "correct horse battery staple" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
};

interface SignInReply {
  readonly code?: string;
  readonly message?: string;
  readonly token?: string;
}

const answerSignIn = (status: number, body: SignInReply) =>
  api.use(
    http.post("*/api/auth/sign-in/email", () =>
      HttpResponse.json(body, { status })
    )
  );

describe("sign-in form", () => {
  beforeAll(() => api.listen({ onUnhandledFrame: "error" }));
  afterEach(() => {
    cleanup();
    api.resetHandlers();
  });

  afterAll(() => api.close());

  it("offers to send the verification link again when the email isn't verified", async () => {
    answerSignIn(403, {
      code: "EMAIL_NOT_VERIFIED",
      message: "Email not verified",
    });
    let resentTo: unknown;
    api.use(
      http.post("*/api/auth/send-verification-email", async ({ request }) => {
        // SAFETY: the sign-in form sends the address it was given as JSON.
        resentTo = ((await request.json()) as { email: string }).email;

        return HttpResponse.json({ status: true });
      })
    );

    renderSignInForm();
    submit();
    fireEvent.click(
      await screen.findByRole("button", { name: "Send a new link" })
    );

    await expect(
      screen.findByText("We sent a new link to ada@example.com.")
    ).resolves.toBeDefined();
    expect(resentTo).toBe("ada@example.com");
  });

  it("asks for a whole email address instead of signing in", async () => {
    let requested = false;
    api.use(
      http.post("*/api/auth/sign-in/email", () => {
        requested = true;

        return HttpResponse.json({ token: "t" });
      })
    );

    renderSignInForm();
    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "ada" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "correct horse battery staple" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    await expect(
      screen.findByText("Enter an email address like name@example.com.")
    ).resolves.toBeDefined();
    expect(screen.getByLabelText("Email").getAttribute("aria-invalid")).toBe(
      "true"
    );
    expect(requested).toBeFalsy();
  });

  it("says the email or password is wrong without saying which", async () => {
    answerSignIn(401, {
      code: "INVALID_EMAIL_OR_PASSWORD",
      message: "Invalid email or password",
    });

    renderSignInForm();
    submit();

    await expect(
      screen.findByText("The email or password is incorrect.")
    ).resolves.toBeDefined();
  });

  it("asks the person to wait after too many attempts", async () => {
    answerSignIn(429, { message: "Too many requests." });

    renderSignInForm();
    submit();

    await expect(
      screen.findByText("Too many attempts. Try again later.")
    ).resolves.toBeDefined();
  });

  it("says Mailquilt couldn't be reached when the request never arrives", async () => {
    api.use(http.post("*/api/auth/sign-in/email", () => HttpResponse.error()));

    renderSignInForm();
    submit();

    await expect(
      screen.findByText(
        "Mailquilt couldn’t be reached. Check your connection, then try again."
      )
    ).resolves.toBeDefined();
  });
});
