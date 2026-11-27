import { CampaignIdSchema, Organization } from "@repo/domain";
import {
  cleanup,
  fireEvent,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { Deferred, Effect, Schema } from "effect";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import {
  ACME,
  renderWithOrganizations,
} from "../organizations/test-organizations.tsx";
import { EditCampaignPage, NewCampaignPage } from "./campaign-form-pages.tsx";
import {
  CAMPAIGN,
  CAMPAIGNS,
  DRAFT,
  OFFERS,
  POSTMARK,
  ready,
  RECIPIENT_COUNT,
  ROAST,
} from "./test-campaigns.ts";

const api = setupServer();

const organization = Schema.decodeUnknownSync(Organization)(ACME);

const Body = Schema.Record(Schema.String, Schema.Unknown);

const type = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });

const submit = (name: string) =>
  fireEvent.submit(
    screen.getByRole("button", { name }).closest("form") ?? document.body
  );

const answerWith = (campaign: typeof DRAFT, status: number) => {
  const received = Deferred.makeUnsafe<typeof Body.Type>();

  return {
    handler: async ({ request }: { request: Request }) => {
      Deferred.doneUnsafe(
        received,
        Effect.succeed(Schema.decodeUnknownSync(Body)(await request.json()))
      );

      return HttpResponse.json(campaign, { status });
    },
    received: Effect.runPromise(Deferred.await(received)),
  };
};

const notifications = () =>
  within(screen.getByRole("region", { name: "Notifications" }));

const CUSTOMERS = {
  ...OFFERS,
  id: "lst_01h455vb4pex5vsknk084sn02s",
  name: "Customers",
};

const reachLine = () => document.querySelector(".mq-reach")?.textContent ?? "";

const group = (name: string) => within(screen.getByRole("group", { name }));

// WARNING: a person clicks a List's name; happy-dom also follows the row's label after the checkbox's own click, so clicking the box there ticks it twice.
const tick = (groupName: string, list: { readonly name: string }) =>
  fireEvent.click(group(groupName).getByText(list.name));

const writeTheEmail = () => {
  type("Subject", DRAFT.subject);
  type("Content", DRAFT.html);
};

describe("writing and editing a campaign", () => {
  beforeAll(() => api.listen({ onUnhandledFrame: "error" }));
  afterEach(() => {
    cleanup();
    api.resetHandlers();
  });

  afterAll(() => api.close());

  it("saves a draft to the one list through the one connection, and opens its page", async () => {
    const create = answerWith(DRAFT, 201);

    api.use(...ready(), http.post(CAMPAIGNS, create.handler));

    const router = renderWithOrganizations(
      <NewCampaignPage organization={organization} />
    );

    await screen.findByLabelText("Subject");
    writeTheEmail();
    submit("Save draft");

    await expect(create.received).resolves.toStrictEqual({
      excludedListIds: [],
      from: POSTMARK.from,
      html: DRAFT.html,
      listIds: [ROAST.id],
      providerConnectionId: POSTMARK.id,
      subject: DRAFT.subject,
    });
    await waitFor(() =>
      expect(router.state.location.pathname).toBe(`/campaigns/${DRAFT.id}`)
    );
    await expect(
      notifications().findByText("Draft saved")
    ).resolves.toBeDefined();
  });

  it("starts a new draft with the Organization's default connection for Campaigns", async () => {
    const create = answerWith(DRAFT, 201);

    const ses = {
      ...POSTMARK,
      defaultForCampaigns: true,
      from: { email: "news@ses.example" },
      id: "pcn_01h455vb4pex5vsknk084sn02r",
      name: "SES",
    };

    api.use(
      ...ready({ connections: [POSTMARK, ses] }),
      http.post(CAMPAIGNS, create.handler)
    );
    renderWithOrganizations(<NewCampaignPage organization={organization} />);

    await screen.findByLabelText("Subject");
    writeTheEmail();
    submit("Save draft");

    await expect(create.received).resolves.toMatchObject({
      from: ses.from,
      providerConnectionId: ses.id,
    });
  });

  it("says what each field still needs, counts them, and focuses the first", async () => {
    const second = { ...POSTMARK, id: "pcn_01h455vb4pex5vsknk084sn02r" };
    api.use(
      ...ready({
        connections: [POSTMARK, second],
        lists: [ROAST, { ...ROAST, id: "lst_01h455vb4pex5vsknk084sn02r" }],
      })
    );
    renderWithOrganizations(<NewCampaignPage organization={organization} />);

    await screen.findByLabelText("Subject");
    submit("Save draft");

    await expect(
      screen.findByText("Choose at least one list.")
    ).resolves.toBeDefined();
    expect(
      screen.getAllByRole("alert").map((alert) => alert.textContent)
    ).toStrictEqual([
      "Choose at least one list.",
      "Choose a provider connection.",
      "Enter an email address.",
      "Enter a subject.",
      "Paste the email’s HTML.",
    ]);
    expect(screen.getByText("Fix 5 fields to save draft.")).toBeDefined();
    expect(document.activeElement).toBe(
      group("Send to").getAllByRole("checkbox")[0]
    );
  });

  it("says what's missing when there's no connection to send through", async () => {
    api.use(...ready({ connections: [] }));
    renderWithOrganizations(<NewCampaignPage organization={organization} />);

    await expect(
      screen.findByRole("heading", { name: "Connect a provider first" })
    ).resolves.toBeDefined();
    expect(screen.queryByLabelText("Subject")).toBeNull();
  });

  it("saves a changed draft and goes back to its page", async () => {
    const update = answerWith(DRAFT, 200);

    api.use(
      ...ready(),
      http.get(CAMPAIGN, () => HttpResponse.json(DRAFT)),
      http.put(CAMPAIGN, update.handler)
    );

    const router = renderWithOrganizations(
      <EditCampaignPage
        campaignId={CampaignIdSchema.make(DRAFT.id)}
        organization={organization}
      />
    );

    await screen.findByDisplayValue(DRAFT.subject);
    type("Subject", "December roast, second try");
    type("Reply-to email (optional)", "hello@acme.example");
    submit("Save changes");

    await expect(update.received).resolves.toStrictEqual({
      excludedListIds: [],
      from: DRAFT.from,
      html: DRAFT.html,
      listIds: [ROAST.id],
      providerConnectionId: POSTMARK.id,
      replyTo: "hello@acme.example",
      subject: "December roast, second try",
    });
    await waitFor(() =>
      expect(router.state.location.pathname).toBe(`/campaigns/${DRAFT.id}`)
    );
    await expect(
      notifications().findByText("Changes saved")
    ).resolves.toBeDefined();
  });

  it("sends to the lists ticked and leaves out the lists ticked under Leave out", async () => {
    const create = answerWith(DRAFT, 201);

    api.use(
      ...ready({ lists: [ROAST, OFFERS, CUSTOMERS] }),
      http.post(CAMPAIGNS, create.handler)
    );
    renderWithOrganizations(<NewCampaignPage organization={organization} />);

    await screen.findByLabelText("Subject");
    tick("Send to", OFFERS);
    tick("Send to", ROAST);
    fireEvent.click(screen.getByRole("button", { name: "Leave out a list" }));
    tick("Leave out", CUSTOMERS);
    writeTheEmail();
    submit("Save draft");

    await expect(create.received).resolves.toMatchObject({
      excludedListIds: [CUSTOMERS.id],
      listIds: [ROAST.id, OFFERS.id],
    });
  });

  it("moves a left-out list back to the lists it's sent to when it's ticked there", async () => {
    const create = answerWith(DRAFT, 201);

    api.use(
      ...ready({ lists: [ROAST, CUSTOMERS] }),
      http.post(CAMPAIGNS, create.handler)
    );
    renderWithOrganizations(<NewCampaignPage organization={organization} />);

    await screen.findByLabelText("Subject");
    tick("Send to", ROAST);
    fireEvent.click(screen.getByRole("button", { name: "Leave out a list" }));
    tick("Leave out", CUSTOMERS);

    expect(
      group("Send to").getByRole("checkbox", {
        name: "Customers Left out below",
      })
    ).toBeDefined();

    tick("Send to", CUSTOMERS);

    expect(group("Leave out").queryByRole("checkbox")).toBeNull();
    expect(
      group("Leave out").getByText("Every list is chosen above.")
    ).toBeDefined();

    writeTheEmail();
    submit("Save draft");

    await expect(create.received).resolves.toMatchObject({
      excludedListIds: [],
      listIds: [ROAST.id, CUSTOMERS.id],
    });
  });

  it("says how many contacts the lists chosen would reach now, from the API's count", async () => {
    const asked: URLSearchParams[] = [];

    api.use(
      http.get(RECIPIENT_COUNT, ({ request }) => {
        asked.push(new URL(request.url).searchParams);

        return HttpResponse.json({ recipients: 1204 });
      }),
      ...ready({ lists: [ROAST, OFFERS, CUSTOMERS] })
    );
    renderWithOrganizations(<NewCampaignPage organization={organization} />);

    await screen.findByLabelText("Subject");
    expect(document.querySelector(".mq-reach")).toBeNull();

    tick("Send to", OFFERS);
    fireEvent.click(screen.getByRole("button", { name: "Leave out a list" }));
    tick("Leave out", CUSTOMERS);

    await expect
      .poll(reachLine)
      .toBe(
        "1,204 contacts would get it nowCounted again at the moment you send."
      );
    expect(
      asked.map((query) => [
        query.getAll("listIds"),
        query.getAll("excludedListIds"),
      ])
    ).toContainEqual([[OFFERS.id], [CUSTOMERS.id]]);
  });

  it.each([
    [
      "no one is subscribed to them",
      { ...ROAST, subscriptions: { ...ROAST.subscriptions, subscribed: 0 } },
      "No one is subscribed to these lists yet.",
    ],
    [
      "everyone subscribed is left out",
      ROAST,
      "Everyone subscribed to these lists is or was on a list you leave out, stopped all marketing email, or has a suppressed address.",
    ],
  ])(
    "says no one would get it now, and that the draft can still be saved, when %s",
    async (_, list, why) => {
      api.use(...ready({ lists: [list], recipients: 0 }));
      renderWithOrganizations(<NewCampaignPage organization={organization} />);

      await expect.poll(reachLine).toContain("No one would get it now");
      expect(reachLine()).toContain(why);
      expect(reachLine()).toContain("You can save the draft");
    }
  );

  it("says when it couldn't count who it goes to, and counts again with Try again", async () => {
    let asked = 0;

    api.use(
      http.get(RECIPIENT_COUNT, () => {
        asked += 1;

        return asked === 1
          ? HttpResponse.error()
          : HttpResponse.json({ recipients: 3 });
      }),
      ...ready()
    );
    renderWithOrganizations(<NewCampaignPage organization={organization} />);

    await expect
      .poll(reachLine)
      .toContain("Mailquilt couldn’t count who it goes to.");

    fireEvent.click(screen.getByRole("button", { name: "Try again" }));

    await expect.poll(reachLine).toContain("3 contacts would get it now");
  });
});
