import { cleanup, fireEvent, screen } from "@testing-library/react";
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

import { SignedInOnly } from "../layout/session-gates.tsx";
import {
  ACME,
  renderWithOrganizations,
} from "../organizations/test-organizations.tsx";
import { Route as HomeRoute } from "../routes/_app/index.tsx";
import { SetupSteps } from "./setup-steps.tsx";

const api = setupServer();

const CONNECTIONS = "*/api/organizations/:organizationId/provider-connections";

const SESSION = {
  session: { expiresAt: "2026-12-01T00:00:00.000Z", id: "s", userId: "u" },
  user: { email: "ada@example.com", emailVerified: true, id: "u", name: "Ada" },
};

const Home = HomeRoute.options.component;

if (Home === undefined) {
  throw new Error("The Home route has no component to render");
}

const SignedInHome = () => (
  <SignedInOnly>
    <Home />
  </SignedInOnly>
);

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

  it("waits on Home until it knows whether a provider is connected", async () => {
    let answered = false;
    api.use(
      http.get("*/api/auth/get-session", () => HttpResponse.json(SESSION)),
      http.get("*/api/organizations", () => HttpResponse.json([ACME])),
      http.get(CONNECTIONS, async () => {
        await vi.waitUntil(() => answered, { timeout: 5000 });

        return HttpResponse.json([]);
      })
    );

    renderWithOrganizations(<SignedInHome />);

    await expect(
      screen.findByText("Loading your setup")
    ).resolves.toBeDefined();
    expect(screen.queryByRole("list")).toBeNull();

    answered = true;

    await expect(
      screen.findByRole("list", {
        name: "Steps to your first campaign, 1 of 5 done",
      })
    ).resolves.toBeDefined();
  });

  it("moves focus to the news that the organization is ready, so it is read out, without Home reloading", async () => {
    let organizations: readonly (typeof ACME)[] = [];
    let answered = false;
    let served = false;
    let relisted = false;
    api.use(
      http.get("*/api/auth/get-session", () => HttpResponse.json(SESSION)),
      http.get("*/api/organizations", async () => {
        if (organizations.length > 0) {
          await vi.waitUntil(() => relisted, { timeout: 5000 });
        }

        return HttpResponse.json(organizations);
      }),
      http.get(CONNECTIONS, async () => {
        await vi.waitUntil(() => answered, { timeout: 5000 });
        served = true;

        return HttpResponse.json([]);
      }),
      http.post("*/api/organizations", () => {
        organizations = [ACME];

        return HttpResponse.json(ACME, { status: 201 });
      })
    );

    renderWithOrganizations(<SignedInHome />);
    fireEvent.change(await screen.findByLabelText("Organization name"), {
      target: { value: "Acme Newsletter" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Create organization" })
    );

    await expect(
      screen.findByText("is ready, and you’re its owner.", { exact: false })
    ).resolves.toBeDefined();
    expect(screen.queryByText("Loading your setup")).toBeNull();

    relisted = true;

    await expect
      .poll(() => document.activeElement?.textContent)
      .toBe("Acme Newsletter is ready, and you’re its owner.");

    answered = true;
    await vi.waitUntil(() => served);
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
