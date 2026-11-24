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
  POSTMARK,
  ready,
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
    expect(
      screen.getByText("3 contacts are subscribed to it now.")
    ).toBeDefined();
    type("Subject", DRAFT.subject);
    type("Content", DRAFT.html);
    submit("Save draft");

    await expect(create.received).resolves.toStrictEqual({
      from: POSTMARK.from,
      html: DRAFT.html,
      listId: ROAST.id,
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

    await expect(screen.findByText("Choose a list.")).resolves.toBeDefined();
    expect(
      screen.getAllByRole("alert").map((alert) => alert.textContent)
    ).toStrictEqual([
      "Choose a list.",
      "Choose a provider connection.",
      "Enter an email address.",
      "Enter a subject.",
      "Paste the email’s HTML.",
    ]);
    expect(screen.getByText("Fix 5 fields to save draft.")).toBeDefined();
    expect(document.activeElement).toBe(
      screen.getByRole("combobox", { name: "List" })
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
      from: DRAFT.from,
      html: DRAFT.html,
      listId: ROAST.id,
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
});
