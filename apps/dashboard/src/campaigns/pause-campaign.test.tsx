import { CampaignIdSchema, Organization } from "@repo/domain";
import {
  act,
  cleanup,
  fireEvent,
  screen,
  within,
} from "@testing-library/react";
import { Schema } from "effect";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import {
  ACME,
  renderWithOrganizations,
} from "../organizations/test-organizations.tsx";
import { CampaignPage } from "./campaign-page.tsx";
import { SENDING_POLL_MS } from "./campaigns-api.ts";
import { CampaignsPage } from "./campaigns-page.tsx";
import {
  CAMPAIGN,
  CAMPAIGNS,
  DRAFT,
  ready,
  SENDING,
  SENT,
} from "./test-campaigns.ts";

const api = setupServer();

const organization = Schema.decodeUnknownSync(Organization)(ACME);

const PAUSE = `${CAMPAIGN}/pause`;
const RESUME = `${CAMPAIGN}/resume`;
const CANCEL = `${CAMPAIGN}/cancel`;

const PARTWAY = {
  ...SENDING,
  recipients: { failed: 1, sent: 40, total: 100 },
};

const PAUSED = { ...PARTWAY, status: "paused" };

const CANCELLED = { ...PARTWAY, status: "cancelled" };

const renderPage = () =>
  renderWithOrganizations(
    <CampaignPage
      campaignId={CampaignIdSchema.make(DRAFT.id)}
      organization={organization}
    />
  );

const statusLine = () => document.querySelector("header p")?.textContent ?? "";

const notifications = () =>
  within(screen.getByRole("region", { name: "Notifications" }));

const answering = (...answers: readonly object[]) => {
  let asked = 0;

  return () => {
    const answer = answers[Math.min(asked, answers.length - 1)];
    asked += 1;

    return HttpResponse.json(answer);
  };
};

const openCancel = async () => {
  fireEvent.click(
    await screen.findByRole("button", { name: "Cancel campaign" })
  );

  return screen.findByRole("alertdialog", {
    name: `Cancel “${DRAFT.subject}”?`,
  });
};

describe("pausing, resuming and cancelling a campaign", () => {
  beforeAll(() => api.listen({ onUnhandledFrame: "error" }));
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    api.resetHandlers();
  });

  afterAll(() => api.close());

  it("shows how far a sending campaign has got", async () => {
    api.use(
      ...ready(),
      http.get(CAMPAIGN, () => HttpResponse.json(PARTWAY))
    );
    renderPage();

    const meter = await screen.findByRole("progressbar", {
      name: "Sent",
    });

    expect(meter.getAttribute("aria-valuetext")).toBe("40 of 100 sent");
    expect(meter.getAttribute("value")).toBe("40");
    expect(screen.getByText("still to send").parentElement?.textContent).toBe(
      "59 still to send"
    );
  });

  it("pauses a sending campaign, saying how many wait, and resumes it", async () => {
    let paused = 0;
    let resumed = 0;
    api.use(
      ...ready(),
      http.get(CAMPAIGN, () => HttpResponse.json(PARTWAY)),
      http.post(PAUSE, () => {
        paused += 1;

        return HttpResponse.json(PAUSED);
      }),
      http.post(RESUME, () => {
        resumed += 1;

        return HttpResponse.json(PARTWAY);
      })
    );
    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: "Pause" }));

    await expect
      .poll(statusLine)
      .toContain(
        "Paused, with 40 of 100 contacts sent it and 59 waiting until you resume it."
      );
    expect(paused).toBe(1);
    await expect(
      notifications().findByText("59 wait until you resume it.")
    ).resolves.toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: "Resume" }));

    await expect.poll(statusLine).toContain("Sending to 100 contacts");
    expect(resumed).toBe(1);
    await expect(
      notifications().findByText("Sending again")
    ).resolves.toBeDefined();
    expect(screen.getByRole("button", { name: "Pause" })).toBeDefined();
  });

  it("cancels a campaign only once confirmed, saying how many it didn't reach", async () => {
    let cancels = 0;
    api.use(
      ...ready(),
      http.get(CAMPAIGN, () => HttpResponse.json(PAUSED)),
      http.post(CANCEL, () => {
        cancels += 1;

        return HttpResponse.json(CANCELLED);
      })
    );
    renderPage();

    const dialog = await openCancel();

    expect(dialog.textContent).toContain(
      "The 59 contacts it hasn’t reached won’t be sent it, and it can’t be resumed. The 40 who were sent it keep it."
    );
    expect(cancels).toBe(0);

    fireEvent.submit(dialog.querySelector("form") ?? document.body);

    await expect
      .poll(statusLine)
      .toContain(
        "Cancelled, with 40 of 100 contacts sent it and 59 left unsent."
      );
    expect(cancels).toBe(1);
    await expect(
      notifications().findByText("Campaign cancelled")
    ).resolves.toBeDefined();
    expect(
      screen.queryAllByRole("button", { name: /^(?:Resume|Cancel campaign)$/u })
    ).toHaveLength(0);
  });

  it("keeps the cancel confirmation open to try again when the server can't be reached", async () => {
    api.use(
      ...ready(),
      http.get(CAMPAIGN, () => HttpResponse.json(PARTWAY)),
      http.post(CANCEL, () => HttpResponse.error())
    );
    renderPage();

    const dialog = await openCancel();

    fireEvent.submit(dialog.querySelector("form") ?? document.body);

    await expect(within(dialog).findByRole("alert")).resolves.toHaveProperty(
      "textContent",
      "Mailquilt couldn’t reach its server. Check your connection, then try again. It’s still sending."
    );
    expect(statusLine()).toContain("Sending to 100 contacts");
  });

  it("says it had already finished when a pause comes after its last email", async () => {
    api.use(
      ...ready(),
      http.get(CAMPAIGN, answering(PARTWAY, SENT)),
      http.post(PAUSE, () =>
        HttpResponse.json({ _tag: "CampaignNotSending" }, { status: 409 })
      )
    );
    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: "Pause" }));

    await expect(
      notifications().findByText("It had already finished sending")
    ).resolves.toBeDefined();
    expect(statusLine()).toContain("Sent to 2 of 3 contacts");
    expect(notifications().queryByText("Sent to 2 of 3 contacts")).toBeNull();
  });

  it("closes the cancel confirmation when the campaign finishes while it's open", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    api.use(...ready(), http.get(CAMPAIGN, answering(PARTWAY, SENT)));
    renderPage();

    await openCancel();
    await act(() => vi.advanceTimersByTimeAsync(SENDING_POLL_MS));

    await expect.poll(() => screen.queryByRole("alertdialog")).toBeNull();
    expect(statusLine()).toContain("Sent to 2 of 3 contacts");
  });

  it("moves focus to the status line when the button that had it goes as the campaign finishes", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    api.use(...ready(), http.get(CAMPAIGN, answering(PARTWAY, SENT)));
    renderPage();

    const pause = await screen.findByRole("button", { name: "Pause" });

    pause.focus();
    await act(() => vi.advanceTimersByTimeAsync(SENDING_POLL_MS));

    await expect.poll(statusLine).toContain("Sent to 2 of 3 contacts");
    expect(document.activeElement?.closest("header p")).not.toBeNull();
  });

  it("says it's still sending when a pause can't reach the server", async () => {
    api.use(
      ...ready(),
      http.get(CAMPAIGN, () => HttpResponse.json(PARTWAY)),
      http.post(PAUSE, () => HttpResponse.error())
    );
    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: "Pause" }));

    await expect(
      notifications().findByText("It’s still sending")
    ).resolves.toBeDefined();
    expect(statusLine()).toContain("Sending to 100 contacts");
  });

  it("lists how many a paused campaign was sent to so far", async () => {
    api.use(
      ...ready(),
      http.get(CAMPAIGNS, () =>
        HttpResponse.json({
          campaigns: [PAUSED],
          next: null,
          previous: null,
          start: 0,
          total: 1,
        })
      )
    );
    renderWithOrganizations(
      <CampaignsPage
        onSearch={() => {}}
        organization={organization}
        search={{}}
      />
    );

    const row = await screen.findByRole("row", { name: /Paused/u });

    expect(row.textContent).toContain("40 of 100");
  });
});
