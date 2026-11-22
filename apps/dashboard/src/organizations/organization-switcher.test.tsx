import { cleanup, fireEvent, screen } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { OrganizationSwitcher } from "./organization-switcher.tsx";
import { ACME, BOLT, renderWithOrganizations } from "./test-organizations.tsx";

const api = setupServer();

describe("organization switcher", () => {
  beforeAll(() => api.listen({ onUnhandledFrame: "error" }));
  afterEach(() => {
    cleanup();
    api.resetHandlers();
    sessionStorage.clear();
    localStorage.clear();
  });

  afterAll(() => api.close());

  it("switches this tab to another organization and remembers it", async () => {
    api.use(
      http.get("*/api/organizations", () => HttpResponse.json([ACME, BOLT]))
    );

    renderWithOrganizations(<OrganizationSwitcher />);
    fireEvent.click(
      await screen.findByRole("button", {
        name: "Organization: Acme Newsletter",
      })
    );
    fireEvent.click(
      await screen.findByRole("menuitemradio", { name: "Bolt Weekly" })
    );

    await expect(
      screen.findByRole("button", { name: "Organization: Bolt Weekly" })
    ).resolves.toBeDefined();

    cleanup();
    renderWithOrganizations(<OrganizationSwitcher />);

    await expect(
      screen.findByRole("button", { name: "Organization: Bolt Weekly" })
    ).resolves.toBeDefined();
  });

  it("keeps a tab in its organization when another tab switches", async () => {
    api.use(
      http.get("*/api/organizations", () => HttpResponse.json([ACME, BOLT]))
    );

    renderWithOrganizations(<OrganizationSwitcher />);
    await screen.findByRole("button", {
      name: "Organization: Acme Newsletter",
    });

    localStorage.setItem("mailquilt.organization", BOLT.id);
    cleanup();
    renderWithOrganizations(<OrganizationSwitcher />);

    await expect(
      screen.findByRole("button", { name: "Organization: Acme Newsletter" })
    ).resolves.toBeDefined();
  });
});
