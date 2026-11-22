import { Organization, ProviderConnectionIdSchema } from "@repo/domain";
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { Schema } from "effect";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import {
  ACME,
  renderWithOrganizations,
} from "../organizations/test-organizations.tsx";
import { ProvidersPage } from "./providers-page.tsx";

const api = setupServer();

const organization = Schema.decodeUnknownSync(Organization)(ACME);

const POSTMARK = {
  createdAt: "2026-11-22T09:00:00.000Z",
  from: { email: "news@acme.example", name: "Acme News" },
  id: "pcn_01h455vb4pex5vsknk084sn02q",
  name: "Postmark",
  provider: "smtp",
  signsIn: true,
  smtp: { host: "smtp.postmarkapp.com", port: 587, security: "starttls" },
};

const TestEmailRequest = Schema.Struct({ to: Schema.String });

const CONNECTIONS = "*/api/organizations/:organizationId/provider-connections";

const TEST_EMAILS = `${CONNECTIONS}/:providerConnectionId/test-emails`;

const withConnections = (connections: readonly object[]) =>
  api.use(
    http.get("*/api/organizations", () => HttpResponse.json([ACME])),
    http.get(CONNECTIONS, () => HttpResponse.json(connections))
  );

const renderPage = (
  props: Partial<React.ComponentProps<typeof ProvidersPage>> = {}
) =>
  renderWithOrganizations(
    <ProvidersPage
      organization={organization}
      testEmailTo="ada@acme.example"
      {...props}
    />
  );

const sendTestEmail = async () => {
  fireEvent.click(
    await screen.findByRole("button", { name: "Send test email" })
  );
  const to = await screen.findByLabelText("Send a test email to");

  expect(to).toHaveProperty("value", "ada@acme.example");
  expect(document.activeElement).toBe(to);
  fireEvent.submit(to.closest("form") ?? document.body);
};

describe("providers page", () => {
  beforeAll(() => api.listen({ onUnhandledFrame: "error" }));
  afterEach(() => {
    cleanup();
    api.resetHandlers();
  });

  afterAll(() => api.close());

  it("leads an Organization with no provider to connect one", async () => {
    withConnections([]);
    renderPage();

    await expect(
      screen.findByText("No provider connected yet")
    ).resolves.toBeTruthy();
    expect(
      screen
        .getByRole("link", { name: "Connect SMTP server" })
        .getAttribute("href")
    ).toBe("/providers/new");
  });

  it("shows each connection's server, encryption and sender", async () => {
    withConnections([POSTMARK]);
    renderPage();

    const card = await screen.findByRole("article", { name: /Postmark/u });

    expect(card.textContent).toContain("smtp.postmarkapp.com:587");
    expect(card.textContent).toContain("STARTTLS");
    expect(card.textContent).toContain("Acme News <news@acme.example>");
  });

  it("sends a test email to the person's own address and says it was accepted", async () => {
    let sentTo = "";
    withConnections([POSTMARK]);
    api.use(
      http.post(TEST_EMAILS, async ({ request }) => {
        sentTo = Schema.decodeUnknownSync(TestEmailRequest)(
          await request.json()
        ).to;

        return HttpResponse.json({ messageId: "<abc@acme.example>" });
      })
    );
    renderPage();

    await sendTestEmail();

    await expect(
      screen.findByText("Sent. Postmark accepted the email.")
    ).resolves.toBeTruthy();
    expect(sentTo).toBe("ada@acme.example");
    expect(screen.getByText(/<abc@acme\.example>/u)).toBeTruthy();
  });

  it("says why the provider refused, in the server's words, and offers to edit", async () => {
    withConnections([POSTMARK]);
    api.use(
      http.post(TEST_EMAILS, () =>
        HttpResponse.json(
          {
            _tag: "SendFailed",
            detail:
              "Invalid login: 535 5.7.8 Authentication credentials invalid",
            reason: "auth",
          },
          { status: 502 }
        )
      )
    );
    renderPage();

    await sendTestEmail();

    const alert = await screen.findByRole("alert");

    expect(alert.textContent).toContain(
      "The server refused the username or password"
    );
    expect(alert.textContent).toContain("535 5.7.8");
    expect(
      screen.getByRole("link", { name: "Edit connection" }).getAttribute("href")
    ).toBe(`/providers/${POSTMARK.id}/edit`);
  });

  it("says when the person has sent too many test emails", async () => {
    withConnections([POSTMARK]);
    api.use(
      http.post(TEST_EMAILS, () =>
        HttpResponse.json(
          { _tag: "RateLimited", retryAfterSeconds: 240 },
          { status: 429 }
        )
      )
    );
    renderPage();

    await sendTestEmail();

    const alert = await screen.findByRole("alert");

    expect(alert.textContent).toContain(
      "You’ve sent 10 test emails in the last 10 minutes"
    );
    expect(alert.textContent).toContain("Try again in 4 minutes.");
  });

  it("opens the test email of a connection that was just connected", async () => {
    withConnections([POSTMARK]);
    renderPage({
      justConnected: ProviderConnectionIdSchema.make(POSTMARK.id),
    });

    const intro = await screen.findByText(
      "Postmark is connected. Send yourself a test to check it works."
    );

    expect(document.activeElement).toBe(intro);
    expect(screen.getByLabelText("Send a test email to")).toBeTruthy();
  });

  it("deletes a connection after asking", async () => {
    let connections: readonly object[] = [POSTMARK];
    withConnections([]);
    api.use(
      http.get(CONNECTIONS, () => HttpResponse.json(connections)),
      http.delete(`${CONNECTIONS}/:providerConnectionId`, () => {
        connections = [];

        return new HttpResponse(null, { status: 204 });
      })
    );
    renderPage();

    fireEvent.click(
      await screen.findByRole("button", { name: "More for Postmark" })
    );
    fireEvent.click(await screen.findByRole("menuitem", { name: "Delete" }));
    fireEvent.click(
      await screen.findByRole("button", { name: "Delete connection" })
    );

    await expect(
      screen.findByText("No provider connected yet")
    ).resolves.toBeTruthy();
    expect(document.activeElement?.textContent).toBe("Deleted Postmark.");
  });

  it("counts a connection someone else already deleted as deleted", async () => {
    let connections: readonly object[] = [POSTMARK];
    withConnections([]);
    api.use(
      http.get(CONNECTIONS, () => HttpResponse.json(connections)),
      http.delete(`${CONNECTIONS}/:providerConnectionId`, () => {
        connections = [];

        return HttpResponse.json(
          { _tag: "ProviderConnectionNotFound" },
          { status: 404 }
        );
      })
    );
    renderPage();

    fireEvent.click(
      await screen.findByRole("button", { name: "More for Postmark" })
    );
    fireEvent.click(await screen.findByRole("menuitem", { name: "Delete" }));
    fireEvent.click(
      await screen.findByRole("button", { name: "Delete connection" })
    );

    await expect(
      screen.findByText("No provider connected yet")
    ).resolves.toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
