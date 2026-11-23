import { cleanup, fireEvent, screen } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import {
  ACME,
  renderWithOrganizations,
} from "../organizations/test-organizations.tsx";
import { SetupSteps } from "./setup-steps.tsx";

const api = setupServer();

const CONNECTIONS = "*/api/organizations/:organizationId/provider-connections";

const POSTMARK = {
  createdAt: "2026-11-22T09:00:00.000Z",
  from: { email: "news@acme.example" },
  id: "pcn_01h455vb4pex5vsknk084sn02q",
  name: "Postmark",
  provider: "smtp",
  signsIn: true,
  smtp: { host: "smtp.postmarkapp.com", port: 587, security: "starttls" },
};

describe("setup steps", () => {
  beforeAll(() => api.listen({ onUnhandledFrame: "error" }));
  afterEach(() => {
    cleanup();
    api.resetHandlers();
  });

  afterAll(() => api.close());

  it("starts with naming an organization", async () => {
    api.use(http.get("*/api/organizations", () => HttpResponse.json([])));

    renderWithOrganizations(<SetupSteps />);

    await expect(
      screen.findByRole("list", {
        name: "Steps to your first campaign, 0 of 5 done",
      })
    ).resolves.toBeDefined();
    await expect(
      screen.findByLabelText("Organization name")
    ).resolves.toBeDefined();
  });

  it("marks naming an organization done once one exists", async () => {
    api.use(
      http.get("*/api/organizations", () => HttpResponse.json([ACME])),
      http.get(CONNECTIONS, () => HttpResponse.json([]))
    );

    renderWithOrganizations(<SetupSteps />);

    await expect(
      screen.findByRole("list", {
        name: "Steps to your first campaign, 1 of 5 done",
      })
    ).resolves.toBeDefined();
    expect(screen.queryByLabelText("Organization name")).toBeNull();
  });

  it("moves focus to the news that the organization is ready, so it is read out", async () => {
    let organizations: readonly (typeof ACME)[] = [];
    api.use(
      http.get("*/api/organizations", () => HttpResponse.json(organizations)),
      http.get(CONNECTIONS, () => HttpResponse.json([])),
      http.post("*/api/organizations", () => {
        organizations = [ACME];

        return HttpResponse.json(ACME, { status: 201 });
      })
    );

    renderWithOrganizations(<SetupSteps />);
    fireEvent.change(await screen.findByLabelText("Organization name"), {
      target: { value: "Acme Newsletter" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Create organization" })
    );

    await expect
      .poll(() => document.activeElement?.textContent)
      .toBe("Acme Newsletter is ready, and you’re its owner.");
  });

  it("leads to connecting a provider, and marks it done once one exists", async () => {
    let connections: readonly object[] = [];
    api.use(
      http.get("*/api/organizations", () => HttpResponse.json([ACME])),
      http.get(CONNECTIONS, () => HttpResponse.json(connections))
    );

    renderWithOrganizations(<SetupSteps />);

    const connect = await screen.findByRole("link", {
      name: "Connect SMTP server",
    });

    expect(connect.getAttribute("href")).toBe("/providers/new");
    cleanup();

    connections = [POSTMARK];
    renderWithOrganizations(<SetupSteps />);

    await expect(
      screen.findByRole("list", {
        name: "Steps to your first campaign, 2 of 5 done",
      })
    ).resolves.toBeDefined();
    expect(
      screen.queryByRole("link", { name: "Connect SMTP server" })
    ).toBeNull();
  });

  it("points to contacts and lists while the next step isn't built yet", async () => {
    api.use(
      http.get("*/api/organizations", () => HttpResponse.json([ACME])),
      http.get(CONNECTIONS, () => HttpResponse.json([POSTMARK]))
    );

    renderWithOrganizations(<SetupSteps />);

    const contacts = await screen.findByRole("link", { name: "add contacts" });

    expect(contacts.getAttribute("href")).toBe("/contacts");
    expect(
      screen.getByRole("link", { name: "make lists" }).getAttribute("href")
    ).toBe("/lists");
  });

  it("says the setup didn't load, rather than guessing the next step", async () => {
    api.use(
      http.get("*/api/organizations", () => HttpResponse.json([ACME])),
      http.get(CONNECTIONS, () => new HttpResponse(null, { status: 500 }))
    );

    renderWithOrganizations(<SetupSteps />);

    const alert = await screen.findByRole("alert");

    expect(alert.textContent).toContain("Your setup didn’t load");
    expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
    expect(
      screen.queryByRole("link", { name: "Connect SMTP server" })
    ).toBeNull();
  });
});
