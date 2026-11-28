import { Organization, ProviderConnectionIdSchema } from "@repo/domain";
import type { ProviderConnectionId } from "@repo/domain";
import {
  act,
  cleanup,
  fireEvent,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { Deferred, Effect, Schema } from "effect";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { useState } from "react";
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
  usesBounceAddress: false,
  emailsPerMinute: null,
  defaultForCampaigns: false,
  smtp: { host: "smtp.postmarkapp.com", port: 587, security: "starttls" },
};

const SES = {
  createdAt: "2026-11-27T09:00:00.000Z",
  defaultForCampaigns: true,
  emailsPerMinute: null,
  from: { email: "news@acme.example" },
  id: "pcn_01h455vb4pex5vsknk084sn02s",
  name: "SES",
  provider: "ses",
  ses: { region: "eu-west-1" },
};

const missingFrom = (row: HTMLElement, texts: readonly string[]) =>
  texts.filter((text) => !(row.textContent ?? "").includes(text));

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
    await screen.findByRole("button", { name: "Send test for Postmark" })
  );
  const to = await screen.findByLabelText("Send to");

  expect(to).toHaveProperty("value", "ada@acme.example");
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
        .getByRole("link", { name: "Connect a provider" })
        .getAttribute("href")
    ).toBe("/providers/new");
  });

  it("asks for the connections once when the session has ended", async () => {
    let asked = 0;
    api.use(
      http.get("*/api/organizations", () => HttpResponse.json([ACME])),
      http.get(CONNECTIONS, () => {
        asked += 1;

        return HttpResponse.json({ _tag: "SignInRequired" }, { status: 401 });
      })
    );
    renderPage();

    await expect(
      screen.findByRole("heading", { name: "Your providers didn’t load" })
    ).resolves.toBeDefined();
    expect(asked).toBe(1);
  });

  it("shows who each connection sends as, through which server, and how securely", async () => {
    withConnections([
      POSTMARK,
      {
        ...POSTMARK,
        from: { email: "news@acme.example" },
        id: "pcn_01h455vb4pex5vsknk084sn02r",
        name: "Office relay",
        signsIn: false,
        smtp: { host: "relay.acme.internal", port: 25, security: "none" },
      },
    ]);
    renderPage();

    const postmark = await screen.findByRole("row", { name: /^Postmark/u });
    const relay = screen.getByRole("row", { name: /^Office relay/u });

    expect(within(postmark).getByText("Acme News")).toBeTruthy();
    expect(postmark.textContent).toContain("news@acme.example");
    expect(postmark.textContent).toContain("smtp.postmarkapp.com:587");
    expect(postmark.textContent).toContain("STARTTLS, with sign-in");
    expect(relay.textContent).toContain("Not encrypted, without sign-in");
  });

  it("shows an SES account, each connection's sending rate, and which one new Campaigns start with", async () => {
    withConnections([{ ...POSTMARK, emailsPerMinute: 30 }, SES]);
    renderPage();

    const postmark = await screen.findByRole("row", { name: /^Postmark/u });
    const ses = screen.getByRole("row", { name: /^SES/u });

    expect(
      missingFrom(postmark, ["SMTP server, connected", "30 emails a minute"])
    ).toStrictEqual([]);
    expect(postmark.textContent).not.toContain("Default for new Campaigns");
    expect(
      missingFrom(ses, [
        "Amazon SES, connected",
        "Amazon SES, eu-west-1",
        "Your SES account’s limit",
        "HTTPS, with an access key",
        "Default for new Campaigns",
      ])
    ).toStrictEqual([]);
  });

  it("offers the steps for bounces and complaints in an SES connection's menu only", async () => {
    api.use(
      http.get("*/api/organizations", () => HttpResponse.json([ACME])),
      http.get(CONNECTIONS, () => HttpResponse.json([POSTMARK, SES]))
    );
    renderPage();

    fireEvent.click(
      await screen.findByRole("button", { name: "More for SES" })
    );

    const bounces = await screen.findByRole("menuitem", {
      name: "Bounces and complaints",
    });

    expect(bounces.getAttribute("href")).toBe(`/providers/${SES.id}/bounces`);

    fireEvent.keyDown(document.activeElement ?? document.body, {
      key: "Escape",
    });
    fireEvent.click(screen.getByRole("button", { name: "More for Postmark" }));

    await screen.findByRole("menuitem", { name: "Edit" });

    expect(
      screen.queryByRole("menuitem", { name: "Bounces and complaints" })
    ).toBeNull();
  });

  it("makes another connection the default for new Campaigns from its menu", async () => {
    let made = "";
    api.use(
      http.get("*/api/organizations", () => HttpResponse.json([ACME])),
      http.get(CONNECTIONS, () =>
        HttpResponse.json(
          [POSTMARK, SES].map((connection) => ({
            ...connection,
            defaultForCampaigns:
              made === ""
                ? connection.defaultForCampaigns
                : connection.id === made,
          }))
        )
      ),
      http.put(
        `${CONNECTIONS}/:providerConnectionId/campaign-default`,
        ({ params }) => {
          made = String(params.providerConnectionId);

          return HttpResponse.json({ ...POSTMARK, defaultForCampaigns: true });
        }
      )
    );
    renderPage();

    fireEvent.click(
      await screen.findByRole("button", { name: "More for SES" })
    );

    expect(
      screen.queryByRole("menuitem", {
        name: "Make default for new Campaigns",
      })
    ).toBeNull();

    fireEvent.keyDown(document.activeElement ?? document.body, {
      key: "Escape",
    });
    fireEvent.click(screen.getByRole("button", { name: "More for Postmark" }));
    fireEvent.click(
      await screen.findByRole("menuitem", {
        name: "Make default for new Campaigns",
      })
    );

    await expect(
      screen.findByText("New Campaigns now start with Postmark")
    ).resolves.toBeTruthy();
    expect(made).toBe(POSTMARK.id);
    expect(
      screen.getByRole("row", { name: /^Postmark/u }).textContent
    ).toContain("Default for new Campaigns");
    expect(
      screen.getByRole("row", { name: /^SES/u }).textContent
    ).not.toContain("Default for new Campaigns");
  });

  it("opens a connection's Edit page without reloading the app", async () => {
    withConnections([POSTMARK]);
    const router = renderPage();

    fireEvent.click(
      await screen.findByRole("button", { name: "More for Postmark" })
    );
    fireEvent.click(await screen.findByRole("menuitem", { name: "Edit" }));

    await waitFor(() =>
      expect(router.state.location.pathname).toBe(
        `/providers/${POSTMARK.id}/edit`
      )
    );
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

    const sent = await screen.findByRole("status");

    expect(sent.textContent).toContain("Postmark accepted the email");
    expect(sentTo).toBe("ada@acme.example");
    fireEvent.click(screen.getByRole("button", { name: "Message ID" }));
    await expect(screen.findByText("<abc@acme.example>")).resolves.toBeTruthy();
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
    expect(document.activeElement).toBe(alert);
    expect(alert.textContent).toContain("535 5.7.8");
    expect(
      screen.getByRole("link", { name: "Edit connection" }).getAttribute("href")
    ).toBe(`/providers/${POSTMARK.id}/edit`);
  });

  it("keeps the last result on screen while sending again", async () => {
    const secondArrived = Deferred.makeUnsafe<boolean>();
    const answerSecond = Deferred.makeUnsafe<boolean>();
    let requests = 0;
    withConnections([POSTMARK]);
    api.use(
      http.post(TEST_EMAILS, async () => {
        requests += 1;

        if (requests === 2) {
          Deferred.doneUnsafe(secondArrived, Effect.succeed(true));
          await Effect.runPromise(Deferred.await(answerSecond));
        }

        return HttpResponse.json({ messageId: "<abc@acme.example>" });
      })
    );
    renderPage();

    await sendTestEmail();
    await screen.findByRole("status");
    fireEvent.submit(
      screen.getByLabelText("Send to").closest("form") ?? document.body
    );
    await act(() =>
      Effect.runPromise(
        Deferred.await(secondArrived).pipe(
          Effect.andThen(Effect.sleep("1 millis"))
        )
      )
    );

    expect(screen.getByText("Postmark accepted the email")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Close" })).toBeTruthy();
    Deferred.doneUnsafe(answerSecond, Effect.succeed(true));
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

  it("opens a just-connected connection's test by itself, as the next step", async () => {
    withConnections([POSTMARK]);
    renderPage({
      justConnected: ProviderConnectionIdSchema.make(POSTMARK.id),
    });

    const dialog = await screen.findByRole("dialog");

    expect(dialog.textContent).toContain(
      "Postmark is connected. Send yourself a test to check it works."
    );
    expect(screen.getByLabelText("Send to")).toHaveProperty(
      "value",
      "ada@acme.example"
    );
  });

  it("says only what Mailquilt found when no server answered", async () => {
    withConnections([POSTMARK]);
    api.use(
      http.post(TEST_EMAILS, () =>
        HttpResponse.json(
          {
            _tag: "SendFailed",
            detail: "smtp.postmarkapp.com has no address.",
            reason: "host-not-found",
          },
          { status: 502 }
        )
      )
    );
    renderPage();

    await sendTestEmail();

    const alert = await screen.findByRole("alert");

    expect(alert.textContent).toContain("smtp.postmarkapp.com doesn’t exist");
    expect(alert.textContent).not.toContain("What the server said");
  });

  it("tells an SES account that couldn't be reached to check its Region, not a host and port", async () => {
    withConnections([SES]);
    api.use(
      http.post(TEST_EMAILS, () =>
        HttpResponse.json(
          {
            _tag: "SendFailed",
            detail:
              "SES didn't answer: getaddrinfo ENOTFOUND email.eu-west-1.amazonaws.com",
            reason: "unreachable",
          },
          { status: 502 }
        )
      )
    );
    renderPage();

    fireEvent.click(
      await screen.findByRole("button", { name: /^Send test for SES/u })
    );
    fireEvent.change(await screen.findByLabelText("Send to"), {
      target: { value: "ada@acme.example" },
    });
    fireEvent.submit(
      screen.getByLabelText("Send to").closest("form") ?? document.body
    );

    const alert = await screen.findByRole("alert");

    expect(alert.textContent).toContain(
      "Check the connection’s Region, and that this Mailquilt server can reach AWS."
    );
    expect(alert.textContent).not.toContain("host and port");
  });

  it("offers to make a sole connection the default for new Campaigns once the default was deleted", async () => {
    withConnections([POSTMARK]);
    renderPage();

    fireEvent.click(
      await screen.findByRole("button", { name: "More for Postmark" })
    );

    await expect(
      screen.findByRole("menuitem", { name: "Make default for new Campaigns" })
    ).resolves.toBeTruthy();
  });

  it("says a connection isn't the default yet when making it so failed", async () => {
    withConnections([POSTMARK, SES]);
    api.use(
      http.put(`${CONNECTIONS}/:providerConnectionId/campaign-default`, () =>
        HttpResponse.error()
      )
    );
    renderPage();

    fireEvent.click(
      await screen.findByRole("button", { name: "More for Postmark" })
    );
    fireEvent.click(
      await screen.findByRole("menuitem", {
        name: "Make default for new Campaigns",
      })
    );

    await expect(
      screen.findByText("Postmark isn’t the default yet")
    ).resolves.toBeTruthy();
    expect(screen.getByRole("row", { name: /^SES/u }).textContent).toContain(
      "Default for new Campaigns"
    );
  });

  it("keeps the just-connected note after the page forgets the news", async () => {
    withConnections([POSTMARK]);

    const ArrivedFromConnect = () => {
      const [news, setNews] = useState<ProviderConnectionId | undefined>(
        ProviderConnectionIdSchema.make(POSTMARK.id)
      );

      return (
        <>
          {news === undefined ? <p>The URL forgot the news.</p> : null}
          <ProvidersPage
            justConnected={news}
            onNewsShown={() => setNews(undefined)}
            organization={organization}
            testEmailTo="ada@acme.example"
          />
        </>
      );
    };

    renderWithOrganizations(<ArrivedFromConnect />);

    await screen.findByText("The URL forgot the news.");

    await expect(
      screen.findByText(
        "Postmark is connected. Send yourself a test to check it works."
      )
    ).resolves.toBeDefined();
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

  it("says the deletion couldn't be confirmed when the server can't be reached", async () => {
    withConnections([POSTMARK]);
    api.use(
      http.delete(`${CONNECTIONS}/:providerConnectionId`, () =>
        HttpResponse.error()
      )
    );
    renderPage();

    fireEvent.click(
      await screen.findByRole("button", { name: "More for Postmark" })
    );
    fireEvent.click(await screen.findByRole("menuitem", { name: "Delete" }));
    fireEvent.click(
      await screen.findByRole("button", { name: "Delete connection" })
    );

    await expect(screen.findByRole("alert")).resolves.toHaveProperty(
      "textContent",
      "Mailquilt couldn’t confirm that Postmark was deleted. Try again."
    );
    expect(
      screen.getByRole("row", { hidden: true, name: /^Postmark/u })
    ).toBeTruthy();
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
