import { CampaignIdSchema, Organization } from "@repo/domain";
import { focusManager } from "@tanstack/react-query";
import {
  act,
  cleanup,
  fireEvent,
  screen,
  within,
} from "@testing-library/react";
import { Deferred, Effect, Schema } from "effect";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { useState } from "react";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { ACME_DOMAIN_HELD } from "../domains/test-domains.ts";
import {
  ACME,
  renderWithOrganizations,
} from "../organizations/test-organizations.tsx";
import { CampaignPage } from "./campaign-page.tsx";
import { SENDING_POLL_MS } from "./campaigns-api.ts";
import {
  CAMPAIGN,
  CAMPAIGNS,
  DRAFT,
  OFFERS,
  ready,
  RECIPIENT_COUNT,
  ROAST,
  SENDING,
  SENT,
} from "./test-campaigns.ts";

const api = setupServer();

const organization = Schema.decodeUnknownSync(Organization)(ACME);

const SEND = `${CAMPAIGN}/send`;

const renderPage = (inOrganization = organization) =>
  renderWithOrganizations(
    <CampaignPage
      campaignId={CampaignIdSchema.make(DRAFT.id)}
      organization={inOrganization}
    />
  );

const statusLine = () => document.querySelector("header p")?.textContent ?? "";

const confirmSend = async () => {
  fireEvent.click(await screen.findByRole("button", { name: "Send now" }));

  const dialog = await screen.findByRole("dialog", {
    name: "Send this campaign now?",
  });

  fireEvent.submit(dialog.querySelector("form") ?? document.body);

  return dialog;
};

const answering = (...answers: readonly object[]) => {
  let asked = 0;

  return () => {
    const answer = answers[Math.min(asked, answers.length - 1)];
    asked += 1;

    return HttpResponse.json(answer);
  };
};

const AddressAddedLater = () => {
  const [current, setCurrent] = useState(organization);

  return (
    <>
      <button
        onClick={() =>
          setCurrent(Schema.decodeUnknownSync(Organization)({ ...ACME }))
        }
        type="button"
      >
        Address added elsewhere
      </button>
      <CampaignPage
        campaignId={CampaignIdSchema.make(DRAFT.id)}
        organization={current}
      />
    </>
  );
};

describe("one campaign's page", () => {
  beforeAll(() => api.listen({ onUnhandledFrame: "error" }));
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    api.resetHandlers();
  });

  afterAll(() => api.close());

  it("sends a draft once confirmed, then follows it from sending to sent", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let sends = 0;
    api.use(
      ...ready(),
      http.get(CAMPAIGNS, () =>
        HttpResponse.json({
          campaigns: [],
          next: null,
          previous: null,
          start: 0,
          total: 1,
        })
      ),
      http.get(CAMPAIGN, answering(DRAFT, SENT)),
      http.post(SEND, () => {
        sends += 1;

        return HttpResponse.json(SENDING);
      })
    );
    renderPage();

    await confirmSend();

    await expect.poll(statusLine).toContain("Sending to 3 contacts since");
    expect(sends).toBe(1);
    expect(screen.queryByRole("button", { name: "Send now" })).toBeNull();

    await act(() => vi.advanceTimersByTimeAsync(SENDING_POLL_MS));

    await expect.poll(statusLine).toContain("Sent to 2 of 3 contacts");
    expect(statusLine()).toContain("1 couldn’t be sent through Postmark.");

    const notifications = within(
      screen.getByRole("region", { name: "Notifications" })
    );

    await expect(
      notifications.findByText("Sent to 2 of 3 contacts")
    ).resolves.toBeDefined();
    expect(
      notifications.getByText("Roast of the month, through Postmark")
    ).toBeDefined();
  });

  it("keeps asking for a paused campaign, so it shows sent once the email in flight when it paused is recorded", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    api.use(
      ...ready(),
      http.get(
        CAMPAIGN,
        answering(
          {
            ...SENDING,
            recipients: { failed: 0, sent: 2, total: 3 },
            status: "paused",
          },
          { ...SENT, recipients: { failed: 0, sent: 3, total: 3 } }
        )
      )
    );
    renderPage();

    await expect.poll(statusLine).toContain("Paused");
    await act(() => vi.advanceTimersByTimeAsync(SENDING_POLL_MS));

    await expect.poll(statusLine).toContain("Sent to 3 contacts");
  });

  it("keeps the confirmation open to try again when the server can't be reached", async () => {
    api.use(
      ...ready(),
      http.get(CAMPAIGN, () => HttpResponse.json(DRAFT)),
      http.post(SEND, () => HttpResponse.error())
    );
    renderPage();

    const dialog = await confirmSend();

    await expect(within(dialog).findByRole("alert")).resolves.toHaveProperty(
      "textContent",
      "Mailquilt couldn’t reach its server. Check your connection, then try again. It won’t be sent twice."
    );
    expect(statusLine()).toContain("Draft, created");
  });

  it("keeps the confirmation open, saying why, when its sending domain's DNS can't be looked up", async () => {
    api.use(
      ...ready(),
      http.get(CAMPAIGN, () => HttpResponse.json(DRAFT)),
      http.post(SEND, () =>
        HttpResponse.json(
          {
            _tag: "DnsLookupFailed",
            detail: "The DNS lookup timed out.",
            name: "_dmarc.acme.example",
          },
          { status: 502 }
        )
      )
    );
    renderPage();

    const dialog = await confirmSend();

    await expect(within(dialog).findByRole("alert")).resolves.toHaveProperty(
      "textContent",
      "Mailquilt couldn’t check its sending domain, because looking up _dmarc.acme.example failed: The DNS lookup timed out. Try again in a moment. It hasn’t been sent."
    );
    expect(statusLine()).toContain("Draft, created");
  });

  it.each([
    [
      "isn't added",
      [],
      "Add acme.example before sending",
      "Add acme.example",
      "/domains/new?domain=acme.example",
    ],
    [
      "failed its last DNS check",
      [ACME_DOMAIN_HELD],
      "acme.example can’t send yet",
      "See its DNS records",
      `/domains/${ACME_DOMAIN_HELD.id}`,
    ],
  ])(
    "says so before sending, and links to the fix, when its domain %s",
    async (_, domains, title, action, href) => {
      api.use(
        ...ready({ domains }),
        http.get(CAMPAIGN, () => HttpResponse.json(DRAFT))
      );
      renderPage();

      await expect(screen.findByText(title)).resolves.toBeDefined();
      expect(
        screen.getAllByRole("link", { name: action })[0]?.getAttribute("href")
      ).toBe(href);
      expect(screen.queryByRole("button", { name: "Send now" })).toBeNull();
    }
  );

  const NOBODY = {
    ...ROAST,
    subscriptions: { ...ROAST.subscriptions, subscribed: 0 },
  };

  it.each([
    [
      "no one is subscribed",
      { _tag: "NoSubscribedContacts" },
      409,
      DRAFT,
      { lists: [NOBODY], recipients: 0 },
      "No one to send to yet",
    ],
    [
      "its connection was deleted",
      { _tag: "ProviderConnectionNotFound" },
      404,
      DRAFT,
      { connections: [] },
      "Choose a provider connection before sending",
    ],
    [
      "its organization has no postal address",
      { _tag: "PostalAddressRequired" },
      409,
      DRAFT,
      {},
      "Add a postal address before sending",
    ],
    [
      "its sending domain failed its DNS check",
      {
        _tag: "SendingDomainNotReady",
        domain: "acme.example",
        sendingDomainId: ACME_DOMAIN_HELD.id,
      },
      409,
      DRAFT,
      { domains: [ACME_DOMAIN_HELD] },
      "acme.example can’t send yet",
    ],
    [
      "it was sent from another tab",
      { _tag: "CampaignNotDraft" },
      409,
      SENT,
      {},
      "This campaign had already been sent",
    ],
  ])(
    "says so on the page, with no Send now, when %s",
    async (_, refusal, status, afterwards, nowOnTheServer, title) => {
      api.use(
        ...ready(),
        http.get(CAMPAIGN, answering(DRAFT, afterwards)),
        http.post(SEND, () => {
          api.use(...ready(nowOnTheServer));

          return HttpResponse.json(refusal, { status });
        })
      );
      renderPage();

      await confirmSend();

      await expect(screen.findByText(title)).resolves.toBeDefined();
      await expect.poll(() => screen.queryByRole("dialog")).toBeNull();
      expect(screen.queryByRole("button", { name: "Send now" })).toBeNull();
    }
  );

  it.each([
    [
      "no one is subscribed to its lists",
      NOBODY,
      `No contacts are subscribed to ${ROAST.name}. Add some, or edit the draft to choose other lists.`,
    ],
    [
      "everyone subscribed is left out",
      ROAST,
      `Everyone subscribed to ${ROAST.name} is or was on a list it leaves out, stopped all marketing email, or has a suppressed address. Add contacts, or edit the draft to choose other lists.`,
    ],
  ])(
    "says there's no one to send to yet, with only Edit, when %s",
    async (_, list, why) => {
      api.use(
        ...ready({ lists: [list], recipients: 0 }),
        http.get(CAMPAIGN, () => HttpResponse.json(DRAFT))
      );
      renderPage();

      await expect(screen.findByText(why)).resolves.toBeDefined();
      expect(screen.getByText("No one now")).toBeDefined();
      expect(screen.queryByRole("button", { name: "Send now" })).toBeNull();
      expect(screen.getByRole("link", { name: "Edit" })).toBeDefined();
    }
  );

  it("says when it couldn't count who it goes to, keeps Send now, and counts again with Try again", async () => {
    let asked = 0;
    const released = Deferred.makeUnsafe<number>();

    api.use(
      http.get(RECIPIENT_COUNT, async () => {
        asked += 1;

        if (asked === 1) {
          return HttpResponse.error();
        }

        const recipients = await Effect.runPromise(Deferred.await(released));

        return HttpResponse.json({ recipients });
      }),
      ...ready(),
      http.get(CAMPAIGN, () => HttpResponse.json(DRAFT))
    );
    renderPage();

    const failed = await screen.findByText("Couldn’t count them");
    const fact = failed.closest("[tabindex='-1']");
    const tryAgain = screen.getByRole("button", { name: "Try again" });

    expect(screen.getByRole("button", { name: "Send now" })).toBeDefined();

    tryAgain.focus();
    fireEvent.click(tryAgain);

    await expect(
      screen.findByRole("button", { name: "Trying again…" })
    ).resolves.toBeDefined();
    expect(fact?.textContent).not.toMatch(/\d/u);

    Deferred.doneUnsafe(released, Effect.succeed(1204));

    await expect(screen.findByText("1,204 contacts")).resolves.toBeDefined();
    expect(document.activeElement).toBe(fact);
  });

  it("stops going by a count of no one once counting again fails, and offers Send now", async () => {
    let asked = 0;

    api.use(
      http.get(RECIPIENT_COUNT, () => {
        asked += 1;

        return asked === 1
          ? HttpResponse.json({ recipients: 0 })
          : HttpResponse.error();
      }),
      ...ready(),
      http.get(CAMPAIGN, () => HttpResponse.json(DRAFT))
    );
    renderPage();

    await expect(
      screen.findByText("No one to send to yet")
    ).resolves.toBeDefined();

    act(() => {
      focusManager.setFocused(false);
      focusManager.setFocused(true);
    });

    await expect(
      screen.findByText("Couldn’t count them")
    ).resolves.toBeDefined();
    expect(screen.queryByText("No one to send to yet")).toBeNull();
    expect(screen.getByRole("button", { name: "Send now" })).toBeDefined();
  });

  it("names how many it goes to, and the lists it goes to and leaves out, before sending", async () => {
    api.use(
      ...ready({ lists: [ROAST, OFFERS], recipients: 1204 }),
      http.get(CAMPAIGN, () =>
        HttpResponse.json({ ...DRAFT, excludedListIds: [OFFERS.id] })
      )
    );
    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: "Send now" }));

    const dialog = await screen.findByRole("dialog", {
      name: "Send this campaign now?",
    });

    expect(dialog.textContent).toContain(
      "It goes now, through Postmark, to the 1,204 contacts who would get it."
    );
    expect(dialog.textContent).toContain(`Sends to${ROAST.name}`);
    expect(dialog.textContent).toContain(`Leaves out${OFFERS.name}`);
  });

  it("offers Send now again once its lists, refused for having no one, have someone to send to", async () => {
    api.use(
      http.get(
        RECIPIENT_COUNT,
        answering({ recipients: 3 }, { recipients: 0 }, { recipients: 3 })
      ),
      ...ready(),
      http.get(CAMPAIGN, () => HttpResponse.json(DRAFT)),
      http.post(SEND, () =>
        HttpResponse.json({ _tag: "NoSubscribedContacts" }, { status: 409 })
      )
    );
    renderPage();

    await confirmSend();
    await expect(
      screen.findByText("No one to send to yet")
    ).resolves.toBeDefined();

    act(() => {
      focusManager.setFocused(false);
      focusManager.setFocused(true);
    });

    await expect(
      screen.findByRole("button", { name: "Send now" })
    ).resolves.toBeDefined();
    expect(screen.queryByText("No one to send to yet")).toBeNull();
  });

  it("asks for a postal address, with a link to add it, before a draft can be sent", async () => {
    api.use(
      ...ready(),
      http.get(CAMPAIGN, () => HttpResponse.json(DRAFT))
    );
    renderPage(
      Schema.decodeUnknownSync(Organization)({ ...ACME, postalAddress: null })
    );

    await expect(
      screen.findByText("Add a postal address before sending")
    ).resolves.toBeDefined();
    expect(screen.queryByRole("button", { name: "Send now" })).toBeNull();
    expect(
      screen
        .getByRole("link", { name: "Add postal address" })
        .getAttribute("href")
    ).toBe("/settings");
    expect(
      screen.getByTitle("Preview of the email").getAttribute("srcdoc")
    ).toContain(">Your postal address goes here</span></p>");
  });

  it("offers Send now again once the postal address it was refused for is added, without leaving the page", async () => {
    api.use(
      ...ready(),
      http.get(CAMPAIGN, () => HttpResponse.json(DRAFT)),
      http.post(SEND, () =>
        HttpResponse.json({ _tag: "PostalAddressRequired" }, { status: 409 })
      )
    );
    renderWithOrganizations(<AddressAddedLater />);

    await confirmSend();

    await expect(
      screen.findByText("Add a postal address before sending")
    ).resolves.toBeDefined();

    fireEvent.click(
      screen.getByRole("button", { name: "Address added elsewhere" })
    );

    await expect(
      screen.findByRole("button", { name: "Send now" })
    ).resolves.toBeDefined();
    expect(
      screen.queryByText("Add a postal address before sending")
    ).toBeNull();
  });

  it("previews the email with the footer it's sent with", async () => {
    api.use(
      ...ready(),
      http.get(CAMPAIGN, () => HttpResponse.json(DRAFT))
    );
    renderPage();

    const preview = await screen.findByTitle("Preview of the email");

    expect(preview.getAttribute("srcdoc")).toContain(
      ">Acme Newsletter, 14 Mill Lane, Bristol BS1 4XE</p>"
    );
  });

  it("says when the Organization has no such campaign", async () => {
    api.use(
      ...ready(),
      http.get(CAMPAIGN, () =>
        HttpResponse.json({ _tag: "CampaignNotFound" }, { status: 404 })
      )
    );
    renderPage();

    await expect(
      screen.findByRole("heading", { name: "This campaign isn’t here" })
    ).resolves.toBeDefined();
  });

  it("says a sent campaign went to everyone when the provider refused none", async () => {
    api.use(
      ...ready(),
      http.get(CAMPAIGN, () =>
        HttpResponse.json({
          ...SENT,
          recipients: { failed: 0, sent: 3, total: 3 },
        })
      )
    );
    renderPage();

    await expect.poll(statusLine).toContain("Sent to 3 contacts");
    expect(statusLine()).not.toContain("couldn’t be sent");
    expect(screen.getByText(ROAST.name)).toBeDefined();
  });
});
