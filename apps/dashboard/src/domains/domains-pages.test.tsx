import { Organization, SendingDomainIdSchema } from "@repo/domain";
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

import {
  ACME,
  renderWithOrganizations,
} from "../organizations/test-organizations.tsx";
import { AddDomainPage } from "./add-domain-page.tsx";
import { DomainPage } from "./domain-page.tsx";
import { DomainsPage } from "./domains-page.tsx";
import { ACME_DOMAIN, ACME_DOMAIN_HELD } from "./test-domains.ts";

const api = setupServer();

const organization = Schema.decodeUnknownSync(Organization)(ACME);

const ORGANIZATION = "*/api/organizations/:organizationId";

const DOMAINS = `${ORGANIZATION}/sending-domains`;

const CHECK = `${DOMAINS}/:sendingDomainId/check`;

const CONNECTIONS = `${ORGANIZATION}/provider-connections`;

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

const UNCHECKED = { ...ACME_DOMAIN, check: null };

const organizations = http.get("*/api/organizations", () =>
  HttpResponse.json([ACME])
);

const renderDomain = (id: string = ACME_DOMAIN.id) =>
  renderWithOrganizations(
    <DomainPage
      organization={organization}
      sendingDomainId={SendingDomainIdSchema.make(id)}
    />
  );

describe("Sending Domains in the dashboard", () => {
  beforeAll(() => api.listen({ onUnhandledFrame: "error" }));
  afterEach(() => {
    cleanup();
    api.resetHandlers();
    vi.useRealTimers();
  });

  afterAll(() => api.close());

  it("lists each domain with whether Campaigns can be sent from it, and what stops one", async () => {
    api.use(
      organizations,
      http.get(DOMAINS, () =>
        HttpResponse.json([
          ACME_DOMAIN,
          {
            ...ACME_DOMAIN_HELD,
            domain: "bolt.example",
            id: "sdm_01h455vb4pex5vsknk084sn02r",
          },
        ])
      )
    );
    renderWithOrganizations(<DomainsPage organization={organization} />);

    const rows = await screen.findAllByRole("row");

    expect(rows.map((row) => row.textContent)).toStrictEqual([
      expect.stringContaining("Domain"),
      expect.stringContaining("ReadyEvery record passes"),
      expect.stringContaining("Can’t send yetFix 1 DKIM record and DMARC"),
    ]);
    expect(
      screen.getByRole("link", { name: "acme.example" }).getAttribute("href")
    ).toBe(`/domains/${ACME_DOMAIN.id}`);
  });

  it("invites adding the first domain", async () => {
    api.use(
      organizations,
      http.get(DOMAINS, () => HttpResponse.json([]))
    );
    renderWithOrganizations(<DomainsPage organization={organization} />);

    await expect(screen.findByText("No domains yet")).resolves.toBeDefined();
    expect(
      screen.getByRole("link", { name: "Add a domain" }).getAttribute("href")
    ).toBe("/domains/new");
  });

  it("refuses a domain or selector DNS can't name, and a selector given twice, before sending anything", async () => {
    let posted = false;
    api.use(
      organizations,
      http.post(DOMAINS, () => {
        posted = true;

        return HttpResponse.json(ACME_DOMAIN, { status: 201 });
      })
    );
    renderWithOrganizations(<AddDomainPage organization={organization} />);

    fireEvent.change(await screen.findByRole("textbox", { name: "Domain" }), {
      target: { value: "acme" },
    });
    fireEvent.change(screen.getByLabelText("Selector 1"), {
      target: { value: "pm._domainkey.acme.example" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Add another selector" })
    );
    fireEvent.change(screen.getByLabelText("Selector 2"), {
      target: { value: "s1" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Add another selector" })
    );
    fireEvent.change(screen.getByLabelText("Selector 3"), {
      target: { value: "S1" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add domain" }));

    await expect(
      screen.findByText("Fix 4 fields to add the domain.")
    ).resolves.toBeDefined();
    expect(screen.getByText("Enter a domain like example.com.")).toBeDefined();
    expect(
      screen.getByText("Enter only the selector, the part before ._domainkey.")
    ).toBeDefined();
    expect(screen.getAllByText("Enter each selector once.")).toHaveLength(2);
    expect(posted).toBeFalsy();
  });

  it("moves focus to the selector added, and to the one before a selector removed", async () => {
    api.use(organizations);
    renderWithOrganizations(<AddDomainPage organization={organization} />);

    fireEvent.click(
      await screen.findByRole("button", { name: "Add another selector" })
    );

    await expect
      .poll(() => document.activeElement)
      .toBe(screen.getByLabelText("Selector 2"));

    for (const _ of [3, 4, 5]) {
      fireEvent.click(
        screen.getByRole("button", { name: "Add another selector" })
      );
    }

    await expect
      .poll(() => document.activeElement)
      .toBe(screen.getByLabelText("Selector 5"));
    expect(
      screen.queryByRole("button", { name: "Add another selector" })
    ).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Remove selector 5" }));

    await expect
      .poll(() => document.activeElement)
      .toBe(screen.getByLabelText("Selector 4"));
  });

  it("adds a domain, lowercased, and opens its page", async () => {
    let payload: unknown;
    api.use(
      organizations,
      http.post(DOMAINS, async ({ request }) => {
        payload = await request.json();

        return HttpResponse.json(ACME_DOMAIN, { status: 201 });
      })
    );

    const router = renderWithOrganizations(
      <AddDomainPage domain="acme.example" organization={organization} />
    );

    await expect(
      screen.findByDisplayValue("acme.example")
    ).resolves.toBeDefined();
    fireEvent.change(screen.getByLabelText("Selector 1"), {
      target: { value: " PM " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add domain" }));

    await vi.waitFor(() =>
      expect(router.state.location.pathname).toBe(`/domains/${ACME_DOMAIN.id}`)
    );
    expect(payload).toStrictEqual({
      dkimSelectors: ["pm"],
      domain: "acme.example",
    });
  });

  it("says when the domain is already added", async () => {
    api.use(
      organizations,
      http.post(DOMAINS, () =>
        HttpResponse.json(
          { _tag: "SendingDomainAlreadyExists" },
          { status: 409 }
        )
      )
    );
    renderWithOrganizations(<AddDomainPage organization={organization} />);

    fireEvent.change(await screen.findByRole("textbox", { name: "Domain" }), {
      target: { value: "acme.example" },
    });
    fireEvent.change(screen.getByLabelText("Selector 1"), {
      target: { value: "pm" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add domain" }));

    await expect(screen.findByRole("alert")).resolves.toHaveProperty(
      "textContent",
      "acme.example is already added. Open it from Domains to see its records."
    );
  });

  it("checks a domain not checked yet as its page opens, and fills in its steps", async () => {
    let checks = 0;
    api.use(
      organizations,
      http.get(CONNECTIONS, () => HttpResponse.json([])),
      http.get(DOMAINS, () =>
        HttpResponse.json([checks === 0 ? UNCHECKED : ACME_DOMAIN_HELD])
      ),
      http.post(CHECK, () => {
        checks += 1;

        return HttpResponse.json(ACME_DOMAIN_HELD);
      })
    );
    renderDomain();

    await expect(
      screen.findByText("Checking its DNS records…")
    ).resolves.toBeDefined();
    await expect(
      screen.findByText("2 records need fixing")
    ).resolves.toBeDefined();
    expect(checks).toBe(1);
    expect(
      screen.getByRole("heading", {
        name: "Step 1, next: Publish your provider’s DKIM keys",
      })
    ).toBeDefined();
    expect(
      screen.getByText("The value your provider gave you for this selector")
    ).toBeDefined();
  });

  it("says a domain isn't checked, rather than still checking, when its first check fails", async () => {
    api.use(
      organizations,
      http.get(CONNECTIONS, () => HttpResponse.json([])),
      http.get(DOMAINS, () => HttpResponse.json([UNCHECKED])),
      http.post(CHECK, () =>
        HttpResponse.json(
          {
            _tag: "DnsLookupFailed",
            detail: "The DNS lookup timed out.",
            name: "pm._domainkey.acme.example",
          },
          { status: 502 }
        )
      )
    );
    renderDomain();

    await expect(screen.findByRole("alert")).resolves.toBeDefined();
    expect(screen.getByText("Not checked yet")).toBeDefined();
    expect(screen.queryByText("Checking its DNS records…")).toBeNull();
  });

  it("copies a value, and says so", async () => {
    api.use(
      organizations,
      http.get(CONNECTIONS, () => HttpResponse.json([])),
      http.get(DOMAINS, () => HttpResponse.json([ACME_DOMAIN_HELD]))
    );
    renderDomain();

    fireEvent.click(
      await screen.findByRole("button", { name: "Copy the DMARC record value" })
    );

    await expect(
      screen.findByText("Copied the DMARC record value")
    ).resolves.toBeDefined();
    await expect(navigator.clipboard.readText()).resolves.toBe(
      "v=DMARC1; p=quarantine"
    );
  });

  it("gives SES's own values when an SES connection sends from the domain", async () => {
    api.use(
      organizations,
      http.get(CONNECTIONS, () => HttpResponse.json([SES])),
      http.get(DOMAINS, () =>
        HttpResponse.json([
          { ...ACME_DOMAIN_HELD, returnPath: "mail.acme.example" },
        ])
      )
    );
    renderDomain();

    await screen.findByRole("heading", {
      name: "Step 1, next: Publish Amazon SES’s DKIM keys",
    });

    expect(
      screen.getByRole("button", { name: "Copy the DKIM key value" })
    ).toBeDefined();
    expect(document.body.textContent).toContain("pm.dkim.amazonses.com");
    expect(document.body.textContent).toContain(
      "10 feedback-smtp.eu-west-1.amazonses.com"
    );
  });

  it("keeps the last results, and says which lookup failed, when a check can't run", async () => {
    api.use(
      organizations,
      http.get(CONNECTIONS, () => HttpResponse.json([])),
      http.get(DOMAINS, () => HttpResponse.json([ACME_DOMAIN_HELD])),
      http.post(CHECK, () =>
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
    renderDomain();

    fireEvent.click(await screen.findByRole("button", { name: "Check now" }));

    const alert = await screen.findByRole("alert");

    expect(
      within(alert).getByText("Mailquilt couldn’t check its DNS records")
    ).toBeDefined();
    expect(alert.textContent).toContain(
      "Looking up _dmarc.acme.example failed: The DNS lookup timed out."
    );
    expect(screen.getByText("Can’t send yet")).toBeDefined();
  });

  it("checks again every minute while it can't send, and stops once it's ready", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let checks = 0;
    api.use(
      organizations,
      http.get(CONNECTIONS, () => HttpResponse.json([])),
      http.get(DOMAINS, () =>
        HttpResponse.json([checks === 0 ? ACME_DOMAIN_HELD : ACME_DOMAIN])
      ),
      http.post(CHECK, () => {
        checks += 1;

        return HttpResponse.json(ACME_DOMAIN);
      })
    );
    renderDomain();

    await screen.findByText("Can’t send yet");
    await act(() => vi.advanceTimersByTimeAsync(60_000));

    await expect(screen.findByText("Ready")).resolves.toBeDefined();
    expect(checks).toBe(1);

    await act(() => vi.advanceTimersByTimeAsync(120_000));

    expect(checks).toBe(1);
  });

  it("moves focus to a step's heading when a check makes the record it was on pass", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let checks = 0;
    api.use(
      organizations,
      http.get(CONNECTIONS, () => HttpResponse.json([])),
      http.get(DOMAINS, () =>
        HttpResponse.json([checks === 0 ? ACME_DOMAIN_HELD : ACME_DOMAIN])
      ),
      http.post(CHECK, () => {
        checks += 1;

        return HttpResponse.json(ACME_DOMAIN);
      })
    );
    renderDomain();

    const copyName = await screen.findByRole("button", {
      name: "Copy the DMARC record name",
    });

    copyName.focus();
    await act(() => vi.advanceTimersByTimeAsync(60_000));

    await expect(screen.findByText("Ready")).resolves.toBeDefined();
    expect(document.activeElement).toBe(
      screen.getByRole("heading", { name: /^Step 2/u })
    );
  });

  it("says a return path under the domain doesn't align when DMARC asks for strict SPF alignment", async () => {
    api.use(
      organizations,
      http.get(CONNECTIONS, () => HttpResponse.json([])),
      http.get(DOMAINS, () =>
        HttpResponse.json([
          {
            ...ACME_DOMAIN,
            check: {
              ...ACME_DOMAIN.check,
              returnPath: {
                aligned: false,
                hasMx: true,
                name: "mail.acme.example",
                status: "warn",
              },
              spf: { ...ACME_DOMAIN.check.spf, name: "mail.acme.example" },
              status: "warning",
            },
            returnPath: "mail.acme.example",
          },
        ])
      )
    );
    renderDomain();

    await expect(
      screen.findByText(
        "acme.example’s DMARC record asks for strict SPF alignment (aspf=s), which counts SPF toward DMARC only for acme.example itself, not a subdomain."
      )
    ).resolves.toBeDefined();
  });

  it("doesn't carry one domain's failed check over to the next domain opened", async () => {
    const BETA = {
      ...ACME_DOMAIN,
      domain: "beta.example",
      id: "sdm_01h455vb4pex5vsknk084sn02r",
    };

    api.use(
      organizations,
      http.get(CONNECTIONS, () => HttpResponse.json([])),
      http.get(DOMAINS, () => HttpResponse.json([ACME_DOMAIN_HELD, BETA])),
      http.post(CHECK, () =>
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

    const OneThenTheOther = () => {
      const [id, setId] = useState(ACME_DOMAIN_HELD.id);

      return (
        <>
          <button onClick={() => setId(BETA.id)} type="button">
            Open beta.example
          </button>
          <DomainPage
            organization={organization}
            sendingDomainId={SendingDomainIdSchema.make(id)}
          />
        </>
      );
    };

    renderWithOrganizations(<OneThenTheOther />);

    fireEvent.click(await screen.findByRole("button", { name: "Check now" }));
    await expect(
      screen.findByText("Mailquilt couldn’t check its DNS records")
    ).resolves.toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: "Open beta.example" }));

    await expect(
      screen.findByRole("heading", { name: "beta.example" })
    ).resolves.toBeDefined();
    expect(
      screen.queryByText("Mailquilt couldn’t check its DNS records")
    ).toBeNull();
  });

  it("removes a domain once confirmed, and goes back to Domains", async () => {
    let removed = false;
    api.use(
      organizations,
      http.get(CONNECTIONS, () => HttpResponse.json([])),
      http.get(DOMAINS, () => HttpResponse.json(removed ? [] : [ACME_DOMAIN])),
      http.delete(`${DOMAINS}/:sendingDomainId`, () => {
        removed = true;

        return new HttpResponse(null, { status: 204 });
      })
    );
    const router = renderDomain();

    fireEvent.click(
      await screen.findByRole("button", { name: "More for acme.example" })
    );
    fireEvent.click(
      await screen.findByRole("menuitem", { name: "Remove domain" })
    );

    const dialog = await screen.findByRole("alertdialog", {
      name: "Remove acme.example?",
    });

    fireEvent.click(
      within(dialog).getByRole("button", { name: "Remove domain" })
    );

    await vi.waitFor(() =>
      expect(router.state.location.pathname).toBe("/domains")
    );
    expect(removed).toBeTruthy();
    await expect(
      screen.findByText("Removed acme.example")
    ).resolves.toBeDefined();
  });

  it("says when the Organization has no such domain", async () => {
    api.use(
      organizations,
      http.get(CONNECTIONS, () => HttpResponse.json([])),
      http.get(DOMAINS, () => HttpResponse.json([ACME_DOMAIN]))
    );
    renderDomain("sdm_01h455vb4pex5vsknk084sn02z");

    await expect(
      screen.findByText("This domain isn’t here")
    ).resolves.toBeDefined();
  });
});
