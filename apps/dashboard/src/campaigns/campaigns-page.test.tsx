import { Organization } from "@repo/domain";
import { cleanup, fireEvent, screen, within } from "@testing-library/react";
import { Schema } from "effect";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import {
  ACME,
  renderWithOrganizations,
} from "../organizations/test-organizations.tsx";
import type { CampaignSearch } from "./campaign-search.ts";
import { CampaignsPage } from "./campaigns-page.tsx";
import {
  CAMPAIGNS,
  DRAFT,
  OFFERS,
  ready,
  ROAST,
  SENT,
} from "./test-campaigns.ts";

const api = setupServer();

const organization = Schema.decodeUnknownSync(Organization)(ACME);

const OLDER = "cmp_01h455vb4pex5vsknk084sn02p";

const NOVEMBER = {
  ...SENT,
  id: "cmp_01h455vb4pex5vsknk084sn02r",
  listIds: [ROAST.id, OFFERS.id],
  subject: "November roast: Colombia Huila",
};

const page = (
  campaigns: readonly object[],
  extra: Partial<{ next: string | null; total: number }> = {}
) => ({
  campaigns,
  next: null,
  previous: null,
  start: 0,
  total: campaigns.length,
  ...extra,
});

const withCampaigns = (answer: ReturnType<typeof page>) =>
  http.get(CAMPAIGNS, () => HttpResponse.json(answer));

const renderPage = (onSearch: (search: CampaignSearch) => void = () => {}) =>
  renderWithOrganizations(
    <CampaignsPage
      onSearch={onSearch}
      organization={organization}
      search={{}}
    />
  );

describe("campaigns page", () => {
  beforeAll(() => api.listen({ onUnhandledFrame: "error" }));
  afterEach(() => {
    cleanup();
    api.resetHandlers();
  });

  afterAll(() => api.close());

  it("leads to a first campaign through the one connection", async () => {
    api.use(...ready(), withCampaigns(page([])));
    renderPage();

    await expect(
      screen.findByRole("heading", { name: "No campaigns yet" })
    ).resolves.toBeDefined();
    expect(
      screen.getByText(
        "Paste the HTML from your email editor, choose a list, and send it through Postmark."
      )
    ).toBeDefined();
    expect(
      screen.getByRole("link", { name: "New campaign" }).getAttribute("href")
    ).toBe("/campaigns/new");
  });

  it("says what's missing before a first campaign, and where to get it", async () => {
    api.use(...ready({ connections: [], lists: [] }), withCampaigns(page([])));
    renderPage();

    await expect(
      screen.findByRole("heading", {
        name: "Two things before your first campaign",
      })
    ).resolves.toBeDefined();
    expect(
      screen.getByRole("link", { name: "Go to Lists" }).getAttribute("href")
    ).toBe("/lists");
    expect(
      screen
        .getByRole("link", { name: "Connect SMTP server" })
        .getAttribute("href")
    ).toBe("/providers/new");
    expect(screen.queryByRole("link", { name: "New campaign" })).toBeNull();
  });

  it("lists each campaign's status, lists and how many it was sent to", async () => {
    api.use(
      ...ready({ lists: [ROAST, OFFERS] }),
      withCampaigns(page([DRAFT, NOVEMBER], { next: OLDER, total: 51 }))
    );
    renderPage();

    const draft = await screen.findByRole("row", { name: /December roast/u });
    const sent = screen.getByRole("row", { name: /November roast/u });

    expect(
      within(draft).getByRole("link", { name: DRAFT.subject })
    ).toHaveProperty("pathname", `/campaigns/${DRAFT.id}`);
    expect(draft.textContent).toContain("DraftRoast of the month");
    expect(within(sent).getByText("Sent")).toBeDefined();
    expect(within(sent).getByText("2")).toBeDefined();
    expect(sent.textContent).toMatch(
      new RegExp(
        `${ROAST.name}\\+1, ${OFFERS.name}.*${ROAST.name} and 1 more, sent`,
        "u"
      )
    );
  });

  it("counts every campaign and pages on to the older ones", async () => {
    const searches: CampaignSearch[] = [];

    api.use(
      ...ready(),
      withCampaigns(page([DRAFT, NOVEMBER], { next: OLDER, total: 51 }))
    );
    renderPage((search) => searches.push(search));

    await expect(screen.findByText("1–2 of 51")).resolves.toBeDefined();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(
      "Campaigns,  51"
    );

    fireEvent.click(screen.getByRole("button", { name: "Next page" }));

    expect(searches).toStrictEqual([{ after: OLDER }]);
  });

  it("offers Try again when the campaigns didn't load", async () => {
    api.use(
      ...ready(),
      http.get(CAMPAIGNS, () =>
        HttpResponse.json({ _tag: "SignInRequired" }, { status: 401 })
      )
    );
    renderPage();

    await expect(
      screen.findByRole("heading", { name: "Your campaigns didn’t load" })
    ).resolves.toBeDefined();
    expect(screen.getByRole("button", { name: "Try again" })).toBeDefined();
  });
});
