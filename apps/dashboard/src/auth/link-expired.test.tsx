import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { LinkExpired } from "./link-expired.tsx";

const api = setupServer();

describe("expired verification link", () => {
  beforeAll(() => api.listen({ onUnhandledFrame: "error" }));
  afterEach(() => {
    cleanup();
    api.resetHandlers();
  });

  afterAll(() => api.close());

  it("sends a fresh link to the address the person enters", async () => {
    let sentTo: unknown;
    let sentFor: unknown;
    api.use(
      http.post("*/api/auth/send-verification-email", async ({ request }) => {
        // SAFETY: the form sends Better Auth a JSON body.
        sentTo = ((await request.json()) as { email: string }).email;

        return HttpResponse.json({ status: true });
      })
    );

    render(
      <QueryClientProvider client={new QueryClient()}>
        <LinkExpired
          error="TOKEN_EXPIRED"
          onSent={(email) => {
            sentFor = email;
          }}
        />
      </QueryClientProvider>
    );
    expect(
      screen.getByRole("heading", { name: "This link has expired" })
    ).toBeDefined();
    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "ada@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send a new link" }));

    await expect.poll(() => sentFor).toBe("ada@example.com");
    expect(sentTo).toBe("ada@example.com");
  });

  it("asks for the address instead of sending a link to nobody", async () => {
    let requested = false;
    api.use(
      http.post("*/api/auth/send-verification-email", () => {
        requested = true;

        return HttpResponse.json({ status: true });
      })
    );

    render(
      <QueryClientProvider client={new QueryClient()}>
        <LinkExpired error="TOKEN_EXPIRED" onSent={() => {}} />
      </QueryClientProvider>
    );
    fireEvent.click(screen.getByRole("button", { name: "Send a new link" }));

    await expect(
      screen.findByText("Enter your email address.")
    ).resolves.toBeDefined();
    expect(screen.getByLabelText("Email").getAttribute("aria-invalid")).toBe(
      "true"
    );
    expect(requested).toBeFalsy();
  });

  it("says the link couldn't be sent when Better Auth refuses", async () => {
    api.use(
      http.post("*/api/auth/send-verification-email", () =>
        HttpResponse.json({ message: "Too many requests." }, { status: 429 })
      )
    );

    render(
      <QueryClientProvider client={new QueryClient()}>
        <LinkExpired error="INVALID_TOKEN" onSent={() => {}} />
      </QueryClientProvider>
    );
    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "ada@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send a new link" }));

    await expect(
      screen.findByText(
        "The link couldn’t be sent. Wait a minute, then try again."
      )
    ).resolves.toBeDefined();
  });
});
