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
import { BouncesPage } from "./bounces-page.tsx";

const STATUS = "*/api/instance";

// WARNING: an SMTP connection's page asks the install's status; most tests are on an install that receives no bounces.
const api = setupServer(
  http.get(STATUS, () =>
    HttpResponse.json({
      bounceDomain: null,
      setUp: true,
      signUp: "invite-only",
    })
  )
);

const organization = Schema.decodeUnknownSync(Organization)(ACME);

const SES = {
  createdAt: "2026-11-27T09:00:00.000Z",
  defaultForCampaigns: true,
  emailsPerMinute: null,
  from: { email: "news@acme.example" },
  id: "pcn_01h455vb4pex5vsknk084sn02r",
  name: "SES (Ireland)",
  provider: "ses",
  ses: { region: "eu-west-1" },
};

const POSTMARK = {
  createdAt: "2026-11-22T09:00:00.000Z",
  defaultForCampaigns: false,
  emailsPerMinute: null,
  from: { email: "news@acme.example" },
  id: "pcn_01h455vb4pex5vsknk084sn02q",
  name: "Postmark",
  provider: "smtp",
  signsIn: true,
  smtp: { host: "smtp.postmarkapp.com", port: 587, security: "starttls" },
  usesBounceAddress: false,
};

const ADDRESS = "https://mail.acme.example/api/webhooks/ses?token=1.abc.def";

const CONNECTIONS = "*/api/organizations/:organizationId/provider-connections";

const ADDRESS_URL = `${CONNECTIONS}/:providerConnectionId/ses-notifications-url`;

const renderBounces = (id: string) =>
  renderWithOrganizations(
    <BouncesPage
      organization={organization}
      providerConnectionId={ProviderConnectionIdSchema.make(id)}
    />
  );

describe("the steps for an SES connection's bounces and complaints", () => {
  beforeAll(() => api.listen({ onUnhandledFrame: "error" }));
  afterEach(() => {
    cleanup();
    api.resetHandlers();
  });

  afterAll(() => api.close());

  it("gives the steps in the connection's Region, with its address hidden until shown", async () => {
    api.use(
      http.get("*/api/organizations", () => HttpResponse.json([ACME])),
      http.get(CONNECTIONS, () => HttpResponse.json([POSTMARK, SES])),
      http.get(ADDRESS_URL, ({ params }) =>
        params.providerConnectionId === SES.id
          ? HttpResponse.json({ url: ADDRESS })
          : HttpResponse.json(
              { _tag: "ProviderConnectionNotFound" },
              { status: 404 }
            )
      )
    );
    renderBounces(SES.id);

    await screen.findByRole("heading", {
      name: "Step 1: Create an SNS topic in eu-west-1",
    });

    expect(
      screen
        .getByRole("link", { name: /^Open SNS in eu-west-1/u })
        .getAttribute("href")
    ).toBe(
      "https://eu-west-1.console.aws.amazon.com/sns/v3/home?region=eu-west-1#/topics"
    );
    expect(document.body.textContent).toContain(
      "Standard topic in Europe (Ireland), the Region SES (Ireland) sends from"
    );
    expect(document.body.textContent).toContain(
      "allow the service ses.amazonaws.com to sns:Publish"
    );
    expect(document.body.textContent).not.toContain(ADDRESS);

    fireEvent.click(screen.getByRole("button", { name: "Show the address" }));

    await expect(screen.findByText(ADDRESS)).resolves.toBeTruthy();
  });

  it("says when the address didn't load, and shows it once Try again gets it", async () => {
    let answers = 0;

    api.use(
      http.get("*/api/organizations", () => HttpResponse.json([ACME])),
      http.get(CONNECTIONS, () => HttpResponse.json([SES])),
      http.get(ADDRESS_URL, () => {
        answers += 1;

        return answers === 1
          ? HttpResponse.error()
          : HttpResponse.json({ url: ADDRESS });
      })
    );
    renderBounces(SES.id);

    const failed = await screen.findByRole("alert");

    expect(failed.textContent).toContain("The address didn’t load.");

    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    fireEvent.click(
      await screen.findByRole("button", { name: "Show the address" })
    );

    await expect(screen.findByText(ADDRESS)).resolves.toBeTruthy();
  });

  it("links a GovCloud connection's steps to GovCloud's own console", async () => {
    api.use(
      http.get("*/api/organizations", () => HttpResponse.json([ACME])),
      http.get(CONNECTIONS, () =>
        HttpResponse.json([{ ...SES, ses: { region: "us-gov-west-1" } }])
      ),
      http.get(ADDRESS_URL, () => HttpResponse.json({ url: ADDRESS }))
    );
    renderBounces(SES.id);

    const sns = await screen.findByRole("link", {
      name: /^Open SNS in us-gov-west-1/u,
    });

    expect(sns.getAttribute("href")).toBe(
      "https://console.amazonaws-us-gov.com/sns/v3/home?region=us-gov-west-1#/topics"
    );
  });

  it("says when the connection isn't in the Organization", async () => {
    api.use(
      http.get("*/api/organizations", () => HttpResponse.json([ACME])),
      http.get(CONNECTIONS, () => HttpResponse.json([SES]))
    );
    renderBounces("pcn_00000000000000000000000000");

    await screen.findByRole("heading", { name: "This connection isn’t here" });

    expect(document.body.textContent).not.toContain("Have SES report them");
  });

  it("says an SMTP server has no such steps, without asking for an address", async () => {
    let asked = false;

    api.use(
      http.get("*/api/organizations", () => HttpResponse.json([ACME])),
      http.get(CONNECTIONS, () => HttpResponse.json([POSTMARK])),
      http.get(ADDRESS_URL, () => {
        asked = true;

        return HttpResponse.json({ url: ADDRESS });
      })
    );
    renderBounces(POSTMARK.id);

    await screen.findByRole("heading", {
      name: "This page is for Amazon SES connections",
    });

    expect(asked).toBeFalsy();
    expect(screen.queryByRole("link", { name: "Edit Postmark" })).toBeNull();
  });

  it("points an SMTP server to its settings on an install that receives bounces", async () => {
    api.use(
      http.get(STATUS, () =>
        HttpResponse.json({
          bounceDomain: "bounces.mail.example.com",
          setUp: true,
          signUp: "invite-only",
        })
      ),
      http.get("*/api/organizations", () => HttpResponse.json([ACME])),
      http.get(CONNECTIONS, () => HttpResponse.json([POSTMARK]))
    );
    renderBounces(POSTMARK.id);

    const edit = await screen.findByRole("link", { name: "Edit Postmark" });

    expect(edit.getAttribute("href")).toBe(`/providers/${POSTMARK.id}/edit`);
    expect(document.body.textContent).toContain("Send bounces to Mailquilt");
  });
});
