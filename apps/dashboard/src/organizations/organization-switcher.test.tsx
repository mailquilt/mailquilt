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
    window.happyDOM?.setViewport({ height: 768, width: 1024 });
  });

  afterAll(() => api.close());

  it("switches this tab to another organization and remembers it", async () => {
    api.use(
      http.get("*/api/organizations", () => HttpResponse.json([ACME, BOLT]))
    );

    renderWithOrganizations(<OrganizationSwitcher />);
    fireEvent.click(
      await screen.findByRole("button", {
        name: "Organization: Acme Newsletter, Owner",
      })
    );
    fireEvent.click(
      await screen.findByRole("menuitemradio", { name: /Bolt Weekly/u })
    );

    await expect(
      screen.findByRole("button", { name: "Organization: Bolt Weekly, Owner" })
    ).resolves.toBeDefined();
    await expect.poll(() => screen.queryByRole("menu")).toBeNull();

    cleanup();
    renderWithOrganizations(<OrganizationSwitcher />);

    await expect(
      screen.findByRole("button", { name: "Organization: Bolt Weekly, Owner" })
    ).resolves.toBeDefined();
  });

  it("keeps a tab in its organization when another tab switches", async () => {
    api.use(
      http.get("*/api/organizations", () => HttpResponse.json([ACME, BOLT]))
    );

    renderWithOrganizations(<OrganizationSwitcher />);
    await screen.findByRole("button", {
      name: "Organization: Acme Newsletter, Owner",
    });

    localStorage.setItem("mailquilt.organization", BOLT.id);
    cleanup();
    renderWithOrganizations(<OrganizationSwitcher />);

    await expect(
      screen.findByRole("button", {
        name: "Organization: Acme Newsletter, Owner",
      })
    ).resolves.toBeDefined();
  });

  it.each([
    { layout: "desktop dialog", width: 1024 },
    { layout: "phone sheet", width: 390 },
  ])(
    "creates an organization from the menu's $layout, switches to it and says so",
    async ({ width }) => {
      window.happyDOM?.setViewport({ height: 844, width });
      let organizations: readonly (typeof ACME | typeof BOLT)[] = [ACME];
      api.use(
        http.get("*/api/organizations", () => HttpResponse.json(organizations)),
        http.post("*/api/organizations", () => {
          organizations = [ACME, BOLT];

          return HttpResponse.json(BOLT, { status: 201 });
        })
      );

      renderWithOrganizations(<OrganizationSwitcher />);
      fireEvent.click(
        await screen.findByRole("button", {
          name: "Organization: Acme Newsletter, Owner",
        })
      );
      fireEvent.click(
        await screen.findByRole("menuitem", { name: "New organization" })
      );
      fireEvent.change(await screen.findByLabelText("Organization name"), {
        target: { value: "Bolt Weekly" },
      });
      fireEvent.click(
        screen.getByRole("button", { name: "Create organization" })
      );

      await expect(
        screen.findByRole("button", {
          name: "Organization: Bolt Weekly, Owner",
        })
      ).resolves.toBeDefined();
      await expect(
        screen.findByText("Created Bolt Weekly")
      ).resolves.toBeDefined();
    }
  );

  it("puts the cursor in the name field when the desktop dialog opens", async () => {
    api.use(http.get("*/api/organizations", () => HttpResponse.json([ACME])));

    renderWithOrganizations(<OrganizationSwitcher />);
    fireEvent.click(
      await screen.findByRole("button", {
        name: "Organization: Acme Newsletter, Owner",
      })
    );
    fireEvent.click(
      await screen.findByRole("menuitem", { name: "New organization" })
    );
    const field = await screen.findByLabelText("Organization name");

    await expect.poll(() => document.activeElement).toBe(field);
  });

  it("returns focus to the switcher after creating from the phone sheet", async () => {
    window.happyDOM?.setViewport({ height: 844, width: 390 });
    let organizations: readonly (typeof ACME | typeof BOLT)[] = [ACME];
    api.use(
      http.get("*/api/organizations", () => HttpResponse.json(organizations)),
      http.post("*/api/organizations", () => {
        organizations = [ACME, BOLT];

        return HttpResponse.json(BOLT, { status: 201 });
      })
    );

    renderWithOrganizations(<OrganizationSwitcher />);
    fireEvent.click(
      await screen.findByRole("button", {
        name: "Organization: Acme Newsletter, Owner",
      })
    );
    fireEvent.click(
      await screen.findByRole("menuitem", { name: "New organization" })
    );
    fireEvent.change(await screen.findByLabelText("Organization name"), {
      target: { value: "Bolt Weekly" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Create organization" })
    );

    const switcher = await screen.findByRole("button", {
      name: "Organization: Bolt Weekly, Owner",
    });

    await expect.poll(() => document.activeElement).toBe(switcher);
  });
});
